// Migración v16: Objetivos semanales (Secretario Fase 3).
// Idempotente. Uso:
//   npm run migrate:dev:v16
//   NODE_ENV=production node scripts/migrate-v16.js
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
  console.log('[migrate-v16] inicio');
  if (await tableExists('ObjetivosSemanales')) {
    console.log('  • ObjetivosSemanales ya existe');
  } else {
    await db.sequelize.query(`
      CREATE TABLE ObjetivosSemanales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        semana DATE NOT NULL,
        texto VARCHAR(300) NOT NULL,
        categoria VARCHAR(60) NULL,
        meta DECIMAL(10,2) NULL,
        progreso DECIMAL(10,2) NOT NULL DEFAULT 0,
        completado TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        INDEX idx_objsem_user_semana (user_id, semana)
      )
    `);
    console.log('  ✓ ObjetivosSemanales creada');
  }
  console.log('[migrate-v16] fin');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
