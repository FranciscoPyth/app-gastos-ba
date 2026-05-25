// Migración v3: cuotas_pagadas en GastosPruebaN8N/Gastos + nueva tabla Suscripciones.
//
// Idempotente. Uso:
//   npm run migrate:dev:v3      (local)
//   NODE_ENV=production node scripts/migrate-v3.js   (prod)

const db = require('../src/models');

async function columnExists(table, column) {
    const [rows] = await db.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
        { replacements: { table, column } }
    );
    return rows.length > 0;
}

async function tableExists(table) {
    const [rows] = await db.sequelize.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table`,
        { replacements: { table } }
    );
    return rows.length > 0;
}

async function addCuotasPagadas() {
    for (const table of ['GastosPruebaN8N', 'Gastos']) {
        if (!(await tableExists(table))) {
            console.log(`  • Tabla ${table} no existe — skip`);
            continue;
        }
        if (await columnExists(table, 'cuotas_pagadas')) {
            console.log(`  • ${table}.cuotas_pagadas ya existe — skip`);
            continue;
        }
        await db.sequelize.query(
            `ALTER TABLE ${table} ADD COLUMN cuotas_pagadas INT NOT NULL DEFAULT 0`
        );
        console.log(`  ✓ ${table}.cuotas_pagadas agregada`);
    }
}

async function createSuscripciones() {
    if (await tableExists('Suscripciones')) {
        console.log('  • Tabla Suscripciones ya existe — skip');
        return;
    }
    await db.sequelize.query(`
        CREATE TABLE Suscripciones (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT NOT NULL,
            descripcion VARCHAR(255) NOT NULL,
            monto DECIMAL(10,2) NOT NULL,
            divisa VARCHAR(10) NOT NULL,
            dia_cobro INT NOT NULL,
            tarjeta_id INT NULL,
            metodo_pago VARCHAR(100) NULL,
            categoria VARCHAR(100) NULL,
            fecha_inicio DATE NOT NULL,
            fecha_fin DATE NULL,
            estado VARCHAR(20) NOT NULL DEFAULT 'activa',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_estado (user_id, estado),
            INDEX idx_tarjeta (tarjeta_id)
        )
    `);
    console.log('  ✓ Tabla Suscripciones creada');
}

async function run() {
    try {
        console.log('[migrate-v3] Iniciando...');
        console.log('[migrate-v3] Paso 1: cuotas_pagadas');
        await addCuotasPagadas();
        console.log('[migrate-v3] Paso 2: tabla Suscripciones');
        await createSuscripciones();
        console.log('[migrate-v3] ✅ Migración v3 completada.');
        process.exit(0);
    } catch (err) {
        console.error('[migrate-v3] ❌ Error:', err);
        process.exit(1);
    }
}

run();
