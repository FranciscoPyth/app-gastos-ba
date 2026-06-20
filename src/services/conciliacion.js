// Núcleo de conciliación de saldos. Lógica pura + acceso a datos.
const { Op } = require('sequelize');

// 'Ingreso' suma; cualquier otro tipo (Gasto, Ahorro, ...) resta.
function getSignoTipo(descripcion) {
  return String(descripcion || '').trim().toLowerCase() === 'ingreso' ? 1 : -1;
}

// Suma `days` a una fecha 'YYYY-MM-DD' usando UTC (sin DST).
function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// Rango [inicio, fin] (DATEONLY, ambos inclusive) del período que cierra en `periodo`.
function calcularRangoPeriodo(frecuencia, periodo) {
  switch (frecuencia) {
    case 'semanal':   return { inicio: addDays(periodo, -6), fin: periodo };
    case 'quincenal': return { inicio: addDays(periodo, -14), fin: periodo };
    case 'mensual':   return { inicio: periodo.slice(0, 8) + '01', fin: periodo };
    case 'diaria':
    default:          return { inicio: periodo, fin: periodo };
  }
}

module.exports = { getSignoTipo, addDays, calcularRangoPeriodo };
