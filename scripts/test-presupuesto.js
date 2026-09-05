const assert = require('assert');
const { toArs, totales } = require('../src/services/presupuesto');

const cot = { usd_ars: 1550, eur_usd: 1.08 };

assert.strictEqual(toArs(1000, 'ARS', cot), 1000);
assert.strictEqual(toArs(100, 'USD', cot), 155000);
assert.strictEqual(Math.round(toArs(100, 'EUR', cot)), 167400); // 100 * 1.08 * 1550

const t = totales(
  [{ monto: 3992939, moneda: 'ARS' }, { monto: 363400, moneda: 'ARS' }],
  [{ monto: 1500, moneda: 'USD' }],
  cot
);
assert.strictEqual(t.disponible_ars, 4356339);
assert.strictEqual(t.asignado_ars, 2325000);   // 1500 * 1550
assert.strictEqual(t.sobrante_ars, 2031339);
assert.strictEqual(t.pct_asignado, 53.4);       // 2325000 / 4356339

console.log('presupuesto tests OK');
