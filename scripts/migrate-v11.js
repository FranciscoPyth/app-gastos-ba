// Migración v11: Presupuesto mensual (Bloque 2 de Ahorros).
//   Crea PresupuestoLineas (ingresos y asignaciones por mes).
// Idempotente. Uso:
//   npm run migrate:dev:v11
//   NODE_ENV=production node scripts/migrate-v11.js
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
  console.log('[migrate-v11] inicio');
  if (await tableExists('PresupuestoLineas')) {
    console.log('  • PresupuestoLineas ya existe');
  } else {
    await db.sequelize.query(`
      CREATE TABLE PresupuestoLineas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        periodo CHAR(7) NOT NULL,
        rol ENUM('ingreso','asignacion') NOT NULL,
        nombre VARCHAR(100) NOT NULL,
        monto DECIMAL(18,2) NOT NULL DEFAULT 0,
        moneda ENUM('USD','ARS','EUR') NOT NULL DEFAULT 'ARS',
        orden INT NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        INDEX idx_preslin_user_periodo (user_id, periodo)
      )
    `);
    console.log('  ✓ PresupuestoLineas creada');
  }
  console.log('[migrate-v11] fin');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
