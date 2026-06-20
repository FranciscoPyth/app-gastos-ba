const assert = require('assert');
const { getSignoTipo, calcularRangoPeriodo } = require('../src/services/conciliacion');

// getSignoTipo: 'Ingreso' suma (+1), todo lo demás resta (-1)
assert.strictEqual(getSignoTipo('Ingreso'), 1);
assert.strictEqual(getSignoTipo('ingreso'), 1);   // case-insensitive
assert.strictEqual(getSignoTipo('Gasto'), -1);
assert.strictEqual(getSignoTipo('Ahorro'), -1);
assert.strictEqual(getSignoTipo('cualquier otra'), -1);

// calcularRangoPeriodo: diaria => inicio == fin == periodo
assert.deepStrictEqual(
  calcularRangoPeriodo('diaria', '2026-06-20'),
  { inicio: '2026-06-20', fin: '2026-06-20' }
);
// semanal => 7 días terminando en periodo (inclusive)
assert.deepStrictEqual(
  calcularRangoPeriodo('semanal', '2026-06-20'),
  { inicio: '2026-06-14', fin: '2026-06-20' }
);
// quincenal => 15 días; mensual => 1ro del mes al periodo
assert.deepStrictEqual(
  calcularRangoPeriodo('quincenal', '2026-06-20'),
  { inicio: '2026-06-06', fin: '2026-06-20' }
);
assert.deepStrictEqual(
  calcularRangoPeriodo('mensual', '2026-06-20'),
  { inicio: '2026-06-01', fin: '2026-06-20' }
);

console.log('OK test-conciliacion (helpers puros)');
