// Migración v13: punto de partida editable en la proyección.
//   Agrega ProyeccionConfig.punto_partida_usd (NULL = usar patrimonio actual).
// Idempotente. Uso:
//   npm run migrate:dev:v13
//   NODE_ENV=production node scripts/migrate-v13.js
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
  console.log('[migrate-v13] inicio');
  if (await columnExists('ProyeccionConfig', 'punto_partida_usd')) {
    console.log('  • ProyeccionConfig.punto_partida_usd ya existe');
  } else {
    await db.sequelize.query('ALTER TABLE ProyeccionConfig ADD COLUMN punto_partida_usd DECIMAL(18,2) NULL');
    console.log('  ✓ ProyeccionConfig.punto_partida_usd agregada');
  }
  console.log('[migrate-v13] fin');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
