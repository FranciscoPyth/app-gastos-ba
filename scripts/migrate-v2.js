// Migración a v2 (monto_original / saldo_restante / Movimientos / divisa en Objetivos).
//
// Idempotente: si el schema ya está migrado, no hace nada.
// Diseñado para correr contra una DB existente (local o prod) preservando registros.
//
// Uso local:   npm run migrate:dev
// Uso prod:    NODE_ENV=production node scripts/migrate-v2.js
//
// Flujo:
//   1. Asegura que existan las nuevas columnas (lo hace sequelize.sync(alter:true) primero).
//   2. Si quedan columnas legacy con data (monto_prestamo, monto), copia esa data a las nuevas
//      columnas y luego elimina las viejas.
//   3. Normaliza estados ('activo' -> 'activa', etc.) y agrega 'divisa' a Objetivos sin valor.
//   4. Backfill best-effort de Movimientos desde GastosPruebaN8N por categoría + descripción.

const db = require('../src/models');

async function columnExists(table, column) {
    const [rows] = await db.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
        { replacements: { table, column } }
    );
    return rows.length > 0;
}

async function migrateDeudas() {
    console.log('[migrate] Deudas...');
    const hasLegacy = await columnExists('Deudas', 'monto_prestamo');

    if (hasLegacy) {
        // Backfill desde columna legacy
        await db.sequelize.query(`
            UPDATE Deudas
            SET monto_original = COALESCE(NULLIF(monto_original, 0), monto_prestamo, 0),
                saldo_restante = COALESCE(NULLIF(saldo_restante, 0), monto_prestamo, 0)
            WHERE monto_prestamo IS NOT NULL
        `);
        console.log('  ✓ Backfill desde monto_prestamo');
        await db.sequelize.query('ALTER TABLE Deudas DROP COLUMN monto_prestamo');
        console.log('  ✓ Columna legacy monto_prestamo eliminada');
    }

    // Normalizar estados viejos
    await db.sequelize.query(`UPDATE Deudas SET estado = 'activa' WHERE estado IN ('activo')`);
    await db.sequelize.query(`UPDATE Deudas SET estado = 'cerrada' WHERE estado IN ('cerrado', 'closed')`);
    await db.sequelize.query(`UPDATE Deudas SET estado = 'en_mora' WHERE estado IN ('default', 'mora')`);
    console.log('  ✓ Estados normalizados');
}

async function migratePrestamos() {
    console.log('[migrate] Prestamos...');
    const hasLegacy = await columnExists('Prestamos', 'monto');

    if (hasLegacy) {
        await db.sequelize.query(`
            UPDATE Prestamos
            SET monto_original = COALESCE(NULLIF(monto_original, 0), monto, 0),
                saldo_restante = COALESCE(NULLIF(saldo_restante, 0), monto, 0)
            WHERE monto IS NOT NULL
        `);
        console.log('  ✓ Backfill desde monto');
        await db.sequelize.query('ALTER TABLE Prestamos DROP COLUMN monto');
        console.log('  ✓ Columna legacy monto eliminada');
    }

    await db.sequelize.query(`UPDATE Prestamos SET estado = 'pagado' WHERE estado IN ('paid')`);
    await db.sequelize.query(`UPDATE Prestamos SET estado = 'parcial' WHERE estado IN ('partial')`);
    await db.sequelize.query(`UPDATE Prestamos SET estado = 'pendiente' WHERE estado IN ('pending') OR estado IS NULL`);
    console.log('  ✓ Estados normalizados');
}

async function migrateObjetivos() {
    console.log('[migrate] Objetivos...');
    await db.sequelize.query(`UPDATE Objetivos SET divisa = 'ARS' WHERE divisa IS NULL OR divisa = ''`);
    await db.sequelize.query(`
        UPDATE Objetivos
        SET estado = CASE
            WHEN monto_actual >= monto_objetivo THEN 'completada'
            ELSE 'activa'
        END
        WHERE estado IS NULL OR estado = ''
    `);
    console.log('  ✓ Divisa y estado normalizados');
}

async function backfillMovimientos() {
    console.log('[migrate] Backfill de Movimientos desde GastosPruebaN8N...');

    // Sólo hace backfill si la tabla Movimientos está vacía (evita duplicados al re-correr).
    const [{ count }] = await db.sequelize.query(
        `SELECT COUNT(*) AS count FROM Movimientos`,
        { type: db.sequelize.QueryTypes.SELECT }
    );
    if (Number(count) > 0) {
        console.log(`  • Movimientos ya tiene ${count} filas. Skip backfill.`);
        return;
    }

    // Por usuario, matchear gastos con la deuda/prestamo/objetivo por nombre.
    const usuarios = await db.Usuarios.findAll();
    let total = 0;

    for (const u of usuarios) {
        const [deudas, prestamos, objetivos] = await Promise.all([
            db.Deudas.findAll({ where: { user_id: u.id } }),
            db.Prestamos.findAll({ where: { user_id: u.id } }),
            db.Objetivos.findAll({ where: { user_id: u.id } })
        ]);

        const gastos = await db.GastosPruebaN8N.findAll({
            where: {
                numero_cel: u.telefono || '',
                categoria: ['Préstamos', 'Deudas', 'Ahorro/Objetivo']
            }
        });

        for (const g of gastos) {
            const desc = (g.descripcion || '').toLowerCase();
            let entidad = null;
            let entidad_tipo = null;
            let tipo = null;

            if (g.categoria === 'Deudas') {
                entidad = deudas.find(d => desc.includes((d.nombre_acreedor || '').toLowerCase()));
                entidad_tipo = 'deuda';
                tipo = 'abono';
            } else if (g.categoria === 'Préstamos') {
                entidad = prestamos.find(p => desc.includes((p.nombre_persona || '').toLowerCase()));
                entidad_tipo = 'prestamo';
                tipo = 'cobro';
            } else if (g.categoria === 'Ahorro/Objetivo') {
                entidad = objetivos.find(o => desc.includes((o.nombre || '').toLowerCase()));
                entidad_tipo = 'objetivo';
                tipo = 'aporte';
            }

            if (entidad) {
                await db.Movimientos.create({
                    user_id: u.id,
                    entidad_tipo,
                    entidad_id: entidad.id,
                    tipo,
                    monto: parseFloat(g.monto),
                    divisa: g.divisa || 'ARS',
                    fecha: g.fecha,
                    gasto_id: g.id,
                    gasto_source: 'GastosPruebaN8N',
                    descripcion: g.descripcion
                });
                total++;
            }
        }
    }

    console.log(`  ✓ ${total} movimientos creados`);
}

async function run() {
    try {
        console.log('[migrate] Iniciando migración v2...');
        console.log('[migrate] Paso 1: sequelize.sync({ alter: true }) para agregar nuevas columnas...');
        await db.sequelize.sync({ alter: true });

        await migrateDeudas();
        await migratePrestamos();
        await migrateObjetivos();
        await backfillMovimientos();

        console.log('[migrate] ✅ Migración completada exitosamente.');
        process.exit(0);
    } catch (err) {
        console.error('[migrate] ❌ Error:', err);
        process.exit(1);
    }
}

run();
