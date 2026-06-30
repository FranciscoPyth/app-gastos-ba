// Migración v6: MP con pregunta de descripción por WhatsApp.
//   MercadoPagoEventos.estado    (pendiente_descripcion | procesado | ignorado)
//   MercadoPagoEventos.monto / divisa / tipo / comercio  (cache del movimiento)
// Idempotente. Uso:
//   npm run migrate:dev:v6
//   NODE_ENV=production node scripts/migrate-v6.js
const db = require('../src/models');

async function columnExists(table, column) {
  const [rows] = await db.sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { replacements: { table, column } }
  );
  return rows.length > 0;
}

async function indexExists(table, indexName) {
  const [rows] = await db.sequelize.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND INDEX_NAME = :indexName`,
    { replacements: { table, indexName } }
  );
  return rows.length > 0;
}

async function addColumn(table, column, ddl) {
  if (await columnExists(table, column)) {
    console.log(`  • ${table}.${column} ya existe`);
    return;
  }
  await db.sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`  ✓ ${table}.${column}`);
}

async function run() {
  console.log('[migrate-v6] inicio');
  const T = 'MercadoPagoEventos';

  await addColumn(T, 'estado', `estado VARCHAR(30) NOT NULL DEFAULT 'procesado'`);
  await addColumn(T, 'monto', `monto DECIMAL(15,2) NULL`);
  await addColumn(T, 'divisa', `divisa VARCHAR(10) NULL`);
  await addColumn(T, 'tipo', `tipo VARCHAR(20) NULL`);
  await addColumn(T, 'comercio', `comercio VARCHAR(255) NULL`);

  if (!(await indexExists(T, 'idx_mp_eventos_user_estado'))) {
    await db.sequelize.query(`CREATE INDEX idx_mp_eventos_user_estado ON ${T} (user_id, estado)`);
    console.log('  ✓ índice idx_mp_eventos_user_estado');
  } else console.log('  • índice idx_mp_eventos_user_estado ya existe');

  console.log('[migrate-v6] fin');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
