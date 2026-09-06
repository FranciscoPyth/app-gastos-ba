// Migración v14: Secretario (Fase 1) — agenda/recordatorios en Telegram.
//   - Usuarios.secretario_habilitado (flag por usuario)
//   - AgendaCategorias (set editable de categorías)
//   - AgendaItems (recordatorios/notas)
// Idempotente. Uso:
//   npm run migrate:dev:v14
//   NODE_ENV=production node scripts/migrate-v14.js
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
  console.log('[migrate-v14] inicio');

  if (await columnExists('Usuarios', 'secretario_habilitado')) {
    console.log('  • Usuarios.secretario_habilitado ya existe');
  } else {
    await db.sequelize.query('ALTER TABLE Usuarios ADD COLUMN secretario_habilitado TINYINT(1) NOT NULL DEFAULT 0');
    console.log('  ✓ Usuarios.secretario_habilitado agregada');
  }

  if (await tableExists('AgendaCategorias')) {
    console.log('  • AgendaCategorias ya existe');
  } else {
    await db.sequelize.query(`
      CREATE TABLE AgendaCategorias (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        nombre VARCHAR(60) NOT NULL,
        orden INT NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        INDEX idx_agendacat_user (user_id)
      )
    `);
    console.log('  ✓ AgendaCategorias creada');
  }

  if (await tableExists('AgendaItems')) {
    console.log('  • AgendaItems ya existe');
  } else {
    await db.sequelize.query(`
      CREATE TABLE AgendaItems (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        texto VARCHAR(500) NOT NULL,
        categoria VARCHAR(60) NULL,
        fecha DATE NULL,
        hora TIME NULL,
        estado ENUM('pendiente','hecho') NOT NULL DEFAULT 'pendiente',
        recordado TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        INDEX idx_agendaitem_user_fecha (user_id, fecha),
        INDEX idx_agendaitem_user_estado (user_id, estado)
      )
    `);
    console.log('  ✓ AgendaItems creada');
  }

  console.log('[migrate-v14] fin');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
