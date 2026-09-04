const assert = require('assert');
const { toUsd, totales } = require('../src/services/patrimonio');

const cot = { usd_ars: 1550, eur_usd: 1.08 };

assert.strictEqual(toUsd(100, 'USD', cot), 100);
assert.strictEqual(toUsd(1550, 'ARS', cot), 1);
assert.strictEqual(Math.round(toUsd(100, 'EUR', cot)), 108);
assert.strictEqual(toUsd(100, 'ARS', { usd_ars: 0, eur_usd: 1.08 }), 0); // sin cotización no divide por 0

const t = totales([
  { saldo: 9820, moneda: 'USD', tipo: 'ahorro' },
  { saldo: 1550000, moneda: 'ARS', tipo: 'inversion' },
], cot);
assert.strictEqual(t.ahorros_usd, 9820);
assert.strictEqual(t.inversiones_usd, 1000);
assert.strictEqual(t.total_usd, 10820);

console.log('patrimonio tests OK');
