// Migración v10: Patrimonio (Bloque 1 de Ahorros).
//   Crea PatrimonioPosiciones, PatrimonioConfig, PatrimonioSnapshots.
// Idempotente. Uso:
//   npm run migrate:dev:v10
//   NODE_ENV=production node scripts/migrate-v10.js
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
  console.log('[migrate-v10] inicio');

  if (await tableExists('PatrimonioPosiciones')) {
    console.log('  • PatrimonioPosiciones ya existe');
  } else {
    await db.sequelize.query(`
      CREATE TABLE PatrimonioPosiciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        billetera VARCHAR(100) NOT NULL,
        moneda ENUM('USD','ARS','EUR') NOT NULL,
        tipo ENUM('ahorro','inversion') NOT NULL,
        saldo DECIMAL(18,2) NOT NULL DEFAULT 0,
        orden INT NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        INDEX idx_patpos_user (user_id)
      )
    `);
    console.log('  ✓ PatrimonioPosiciones creada');
  }

  if (await tableExists('PatrimonioConfig')) {
    console.log('  • PatrimonioConfig ya existe');
  } else {
    await db.sequelize.query(`
      CREATE TABLE PatrimonioConfig (
        user_id INT PRIMARY KEY,
        usd_ars DECIMAL(18,4) NOT NULL DEFAULT 1000,
        eur_usd DECIMAL(18,4) NOT NULL DEFAULT 1.08,
        updated_at DATETIME NOT NULL
      )
    `);
    console.log('  ✓ PatrimonioConfig creada');
  }

  if (await tableExists('PatrimonioSnapshots')) {
    console.log('  • PatrimonioSnapshots ya existe');
  } else {
    await db.sequelize.query(`
      CREATE TABLE PatrimonioSnapshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        periodo CHAR(7) NOT NULL,
        fecha DATETIME NOT NULL,
        total_usd DECIMAL(18,2) NOT NULL,
        ahorros_usd DECIMAL(18,2) NOT NULL,
        inversiones_usd DECIMAL(18,2) NOT NULL,
        usd_ars DECIMAL(18,4) NOT NULL,
        eur_usd DECIMAL(18,4) NOT NULL,
        detalle JSON NULL,
        UNIQUE INDEX uniq_patsnap_user_periodo (user_id, periodo)
      )
    `);
    console.log('  ✓ PatrimonioSnapshots creada');
  }

  console.log('[migrate-v10] fin');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
