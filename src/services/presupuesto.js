// Lógica pura del presupuesto: conversión a ARS (base) y totales. Sin acceso a DB.
function round2(x) { return Math.round((Number(x) || 0) * 100) / 100; }

// usd_ars = ARS por 1 USD ; eur_usd = USD por 1 EUR.
function toArs(monto, moneda, cot) {
  const n = Number(monto) || 0;
  const usdArs = Number(cot && cot.usd_ars) || 0;
  const eurUsd = Number(cot && cot.eur_usd) || 0;
  if (moneda === 'ARS') return n;
  if (moneda === 'USD') return n * usdArs;
  if (moneda === 'EUR') return n * eurUsd * usdArs;
  return 0;
}

function totales(ingresos, asignaciones, cot) {
  let disp = 0, asig = 0;
  for (const l of ingresos || []) disp += toArs(l.monto, l.moneda, cot);
  for (const l of asignaciones || []) asig += toArs(l.monto, l.moneda, cot);
  const disponible = round2(disp);
  const asignado = round2(asig);
  return {
    disponible_ars: disponible,
    asignado_ars: asignado,
    sobrante_ars: round2(disponible - asignado),
    pct_asignado: disponible ? Math.round((asignado / disponible) * 1000) / 10 : 0,
  };
}

module.exports = { toArs, totales, round2 };
