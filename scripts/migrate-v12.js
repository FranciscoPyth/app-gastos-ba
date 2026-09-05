// Migración v12: Proyección (Bloque 3 de Ahorros).
//   Crea ProyeccionConfig (parámetros del escenario de proyección por usuario).
// Idempotente. Uso:
//   npm run migrate:dev:v12
//   NODE_ENV=production node scripts/migrate-v12.js
const db = require('../src/models');

async function tableExists(table) {
  const [rows] = await db.sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table`,
    { replacements: { table } }
  );
  return rows.length > 0;
}

async function run() {
  console.log('[migrate-v12] inicio');
  if (await tableExists('ProyeccionConfig')) {
    console.log('  • ProyeccionConfig ya existe');
  } else {
    await db.sequelize.query(`
      CREATE TABLE ProyeccionConfig (
        user_id INT PRIMARY KEY,
        aporte_mensual_usd DECIMAL(18,2) NOT NULL DEFAULT 0,
        horizonte_meses INT NOT NULL DEFAULT 12,
        rendimiento_anual_pct DECIMAL(6,2) NOT NULL DEFAULT 0,
        meta_usd DECIMAL(18,2) NULL,
        updated_at DATETIME NOT NULL
      )
    `);
    console.log('  ✓ ProyeccionConfig creada');
  }
  console.log('[migrate-v12] fin');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
