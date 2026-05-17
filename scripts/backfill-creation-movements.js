// Para deudas/préstamos ya existentes que no tienen su movimiento de creación
// (toma_deuda / otorgamiento_prestamo), los crea retroactivamente.
//
// Idempotente: si ya existe un Movimiento del tipo correspondiente para esa entidad, no duplica.

const db = require('../src/models');
const {
    registrarCreacionDeuda,
    registrarCreacionPrestamo
} = require('../src/utils/movimientos');

async function run() {
    try {
        await db.sequelize.sync({ alter: true });

        const deudas = await db.Deudas.findAll();
        let createdDeuda = 0;
        for (const d of deudas) {
            const exists = await db.Movimientos.findOne({
                where: { entidad_tipo: 'deuda', entidad_id: d.id, tipo: 'toma_deuda' }
            });
            if (exists) continue;
            try {
                await registrarCreacionDeuda(d, {});
                createdDeuda++;
            } catch (e) {
                console.error(`[backfill] deuda ${d.id} error:`, e.message);
            }
        }

        const prestamos = await db.Prestamos.findAll();
        let createdPrestamo = 0;
        for (const p of prestamos) {
            const exists = await db.Movimientos.findOne({
                where: { entidad_tipo: 'prestamo', entidad_id: p.id, tipo: 'otorgamiento_prestamo' }
            });
            if (exists) continue;
            try {
                await registrarCreacionPrestamo(p, {});
                createdPrestamo++;
            } catch (e) {
                console.error(`[backfill] prestamo ${p.id} error:`, e.message);
            }
        }

        console.log(`[backfill] toma_deuda creados: ${createdDeuda} / ${deudas.length}`);
        console.log(`[backfill] otorgamiento_prestamo creados: ${createdPrestamo} / ${prestamos.length}`);
        process.exit(0);
    } catch (err) {
        console.error('[backfill] error:', err);
        process.exit(1);
    }
}

run();
