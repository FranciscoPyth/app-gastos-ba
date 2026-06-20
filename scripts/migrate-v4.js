// Migración v4: conciliación de saldos.
//   - Usuarios.frecuencia_conciliacion
//   - Gastos.conciliacion_id
//   - Tablas CuentasConciliables, SaldosIniciales, Conciliaciones
// Idempotente. Uso:
//   npm run migrate:dev:v4
//   NODE_ENV=production node scripts/migrate-v4.js
const db = require('../src/models');

async function columnExists(table, column) {
  const [rows] = await db.sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { replacements: { table, column } }
  );
  return rows.length > 0;
}

async function tableExists(table) {
  const [rows] = await db.sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table`,
    { replacements: { table } }
  );
  return rows.length > 0;
}

async function run() {
  console.log('[migrate-v4] inicio');

  if (!(await columnExists('Usuarios', 'frecuencia_conciliacion'))) {
    await db.sequelize.query(
      `ALTER TABLE Usuarios ADD COLUMN frecuencia_conciliacion
       ENUM('diaria','semanal','quincenal','mensual') NOT NULL DEFAULT 'diaria'`
    );
    console.log('  ✓ Usuarios.frecuencia_conciliacion');
  } else console.log('  • Usuarios.frecuencia_conciliacion ya existe');

  if (!(await tableExists('Conciliaciones'))) {
    await db.sequelize.query(`
      CREATE TABLE Conciliaciones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        metodopago_id INT NOT NULL,
        divisa_id INT NOT NULL,
        periodo DATE NOT NULL,
        saldo_base DECIMAL(12,2) NOT NULL,
        saldo_teorico DECIMAL(12,2) NOT NULL,
        saldo_real DECIMAL(12,2) NOT NULL,
        diferencia DECIMAL(12,2) NOT NULL,
        estado ENUM('conciliada','pendiente') NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_conciliacion_par_periodo (metodopago_id, divisa_id, periodo),
        KEY idx_conciliacion_user_periodo (usuario_id, periodo)
      )`);
    console.log('  ✓ tabla Conciliaciones');
  } else console.log('  • Conciliaciones ya existe');

  if (!(await tableExists('CuentasConciliables'))) {
    await db.sequelize.query(`
      CREATE TABLE CuentasConciliables (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        metodopago_id INT NOT NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        UNIQUE KEY uniq_cuenta_conciliable (usuario_id, metodopago_id)
      )`);
    console.log('  ✓ tabla CuentasConciliables');
  } else console.log('  • CuentasConciliables ya existe');

  if (!(await tableExists('SaldosIniciales'))) {
    await db.sequelize.query(`
      CREATE TABLE SaldosIniciales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        metodopago_id INT NOT NULL,
        divisa_id INT NOT NULL,
        saldo_inicial DECIMAL(12,2) NOT NULL,
        fecha DATE NOT NULL,
        UNIQUE KEY uniq_saldo_inicial_par (metodopago_id, divisa_id)
      )`);
    console.log('  ✓ tabla SaldosIniciales');
  } else console.log('  • SaldosIniciales ya existe');

  if (!(await columnExists('Gastos', 'conciliacion_id'))) {
    await db.sequelize.query(`ALTER TABLE Gastos ADD COLUMN conciliacion_id INT NULL`);
    console.log('  ✓ Gastos.conciliacion_id');
  } else console.log('  • Gastos.conciliacion_id ya existe');

  console.log('[migrate-v4] fin');
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
