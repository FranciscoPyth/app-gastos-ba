// Migración v15: Google Calendar (Secretario Fase 2) — tokens OAuth por usuario.
// Idempotente. Uso:
//   npm run migrate:dev:v15
//   NODE_ENV=production node scripts/migrate-v15.js
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
  console.log('[migrate-v15] inicio');
  if (await tableExists('GoogleCalendarCuentas')) {
    console.log('  • GoogleCalendarCuentas ya existe');
  } else {
    await db.sequelize.query(`
      CREATE TABLE GoogleCalendarCuentas (
        user_id INT PRIMARY KEY,
        refresh_token TEXT NOT NULL,
        access_token TEXT NULL,
        token_expiry DATETIME NULL,
        google_email VARCHAR(255) NULL,
        scope VARCHAR(255) NULL,
        created_at DATETIME NOT NULL
      )
    `);
    console.log('  ✓ GoogleCalendarCuentas creada');
  }
  console.log('[migrate-v15] fin');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
