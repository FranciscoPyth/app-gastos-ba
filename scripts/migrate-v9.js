// Migración v9: aviso de migración a Telegram por WhatsApp.
//   Agrega Usuarios.telegram_nudge_at (DATETIME) para throttlear el aviso (1/día).
// Idempotente. Uso:
//   npm run migrate:dev:v9
//   NODE_ENV=production node scripts/migrate-v9.js
const db = require('../src/models');

async function columnExists(table, column) {
  const [rows] = await db.sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { replacements: { table, column } }
  );
  return rows.length > 0;
}

async function run() {
  console.log('[migrate-v9] inicio');

  if (await columnExists('Usuarios', 'telegram_nudge_at')) {
    console.log('  • Usuarios.telegram_nudge_at ya existe');
  } else {
    await db.sequelize.query('ALTER TABLE Usuarios ADD COLUMN telegram_nudge_at DATETIME NULL');
    console.log('  ✓ Usuarios.telegram_nudge_at agregada');
  }

  console.log('[migrate-v9] fin');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
