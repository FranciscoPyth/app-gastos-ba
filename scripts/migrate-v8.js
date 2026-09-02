// Migración v8: canal Telegram (paralelo a WhatsApp).
//   - Agrega Usuarios.telegram_chat_id (BIGINT, único, nullable).
//   - Crea la tabla TelegramLinkTokens (deep-link para vincular cuenta ↔ chat).
// Idempotente. Uso:
//   npm run migrate:dev:v8
//   NODE_ENV=production node scripts/migrate-v8.js
const db = require('../src/models');

async function tableExists(table) {
  const [rows] = await db.sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table`,
    { replacements: { table } }
  );
  return rows.length > 0;
}

async function columnExists(table, column) {
  const [rows] = await db.sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { replacements: { table, column } }
  );
  return rows.length > 0;
}

async function run() {
  console.log('[migrate-v8] inicio');

  if (await columnExists('Usuarios', 'telegram_chat_id')) {
    console.log('  • Usuarios.telegram_chat_id ya existe');
  } else {
    await db.sequelize.query(
      `ALTER TABLE Usuarios ADD COLUMN telegram_chat_id BIGINT NULL,
       ADD UNIQUE INDEX uniq_usuarios_telegram_chat_id (telegram_chat_id)`
    );
    console.log('  ✓ Usuarios.telegram_chat_id agregada');
  }

  const T = 'TelegramLinkTokens';
  if (await tableExists(T)) {
    console.log(`  • ${T} ya existe`);
  } else {
    await db.sequelize.query(`
      CREATE TABLE ${T} (
        token VARCHAR(64) PRIMARY KEY,
        user_id INT NOT NULL,
        created_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        INDEX idx_tglink_user (user_id),
        INDEX idx_tglink_expires (expires_at)
      )
    `);
    console.log(`  ✓ ${T} creada`);
  }

  console.log('[migrate-v8] fin');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
