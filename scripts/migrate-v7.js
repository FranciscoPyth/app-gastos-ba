// Migración v7: panel de usuarios + re-enganche.
//   Crea la tabla RecordatoriosReenganche (registro de recordatorios enviados).
// Idempotente. Uso:
//   npm run migrate:dev:v7
//   NODE_ENV=production node scripts/migrate-v7.js
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
  console.log('[migrate-v7] inicio');
  const T = 'RecordatoriosReenganche';

  if (await tableExists(T)) {
    console.log(`  • ${T} ya existe`);
  } else {
    await db.sequelize.query(`
      CREATE TABLE ${T} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        enviado_at DATETIME NOT NULL,
        template VARCHAR(100) NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'enviado',
        error TEXT NULL,
        wa_message_id VARCHAR(120) NULL,
        INDEX idx_reenganche_user_fecha (user_id, enviado_at)
      )
    `);
    console.log(`  ✓ ${T} creada`);
  }

  console.log('[migrate-v7] fin');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
