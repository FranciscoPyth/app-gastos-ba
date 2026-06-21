// Migración v5: panel de administración de plataforma.
//   - Usuarios.is_admin (flag de cuenta admin)
//   - Marca como admin a las cuentas en ADMIN_EMAILS (o el default).
// Idempotente. Uso:
//   npm run migrate:dev:v5
//   NODE_ENV=production node scripts/migrate-v5.js
const db = require('../src/models');

const DEFAULT_ADMIN_EMAILS = ['franciscosaggiorato0@gmail.com'];

async function columnExists(table, column) {
  const [rows] = await db.sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { replacements: { table, column } }
  );
  return rows.length > 0;
}

async function run() {
  console.log('[migrate-v5] inicio');

  if (!(await columnExists('Usuarios', 'is_admin'))) {
    await db.sequelize.query(
      `ALTER TABLE Usuarios ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0`
    );
    console.log('  ✓ Usuarios.is_admin');
  } else console.log('  • Usuarios.is_admin ya existe');

  const emails = (process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim()).filter(Boolean)
    : DEFAULT_ADMIN_EMAILS);

  const [result] = await db.sequelize.query(
    `UPDATE Usuarios SET is_admin = 1 WHERE email IN (:emails)`,
    { replacements: { emails } }
  );
  console.log(`  ✓ Cuentas marcadas como admin (${emails.join(', ')})`);

  console.log('[migrate-v5] fin');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
