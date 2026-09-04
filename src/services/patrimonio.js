// Lógica pura de patrimonio: conversión a USD y totales. Sin acceso a DB.
function round2(x) { return Math.round((Number(x) || 0) * 100) / 100; }

// Convierte un saldo a USD según la moneda y la cotización.
//   usd_ars = ARS por 1 USD ; eur_usd = USD por 1 EUR.
function toUsd(saldo, moneda, cotizacion) {
  const n = Number(saldo) || 0;
  const usdArs = Number(cotizacion && cotizacion.usd_ars) || 0;
  const eurUsd = Number(cotizacion && cotizacion.eur_usd) || 0;
  if (moneda === 'USD') return n;
  if (moneda === 'ARS') return usdArs ? n / usdArs : 0;
  if (moneda === 'EUR') return n * eurUsd;
  return 0;
}

// Suma las posiciones a USD y separa por tipo.
function totales(posiciones, cotizacion) {
  let ahorros = 0, inversiones = 0;
  for (const p of posiciones || []) {
    const usd = toUsd(p.saldo, p.moneda, cotizacion);
    if (p.tipo === 'inversion') inversiones += usd; else ahorros += usd;
  }
  return {
    total_usd: round2(ahorros + inversiones),
    ahorros_usd: round2(ahorros),
    inversiones_usd: round2(inversiones),
  };
}

module.exports = { toUsd, totales, round2 };
