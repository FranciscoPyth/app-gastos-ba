// Helpers de semana (lunes–domingo) en horario Argentina (UTC-3). Devuelven 'YYYY-MM-DD'.
function nowAr() { return new Date(Date.now() - 3 * 60 * 60 * 1000); }

function lunesDe(d) {
  const dow = d.getUTCDay(); // 0=domingo … 6=sábado
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getTime() + diff * 86400000);
  return monday.toISOString().split('T')[0];
}

function lunesActual() { return lunesDe(nowAr()); }

function lunesDeFecha(ymd) { return lunesDe(new Date(`${ymd}T12:00:00Z`)); }

function semanaAnterior(lunesYmd) {
  const d = new Date(`${lunesYmd}T12:00:00Z`);
  return new Date(d.getTime() - 7 * 86400000).toISOString().split('T')[0];
}

module.exports = { lunesActual, lunesDeFecha, semanaAnterior };
