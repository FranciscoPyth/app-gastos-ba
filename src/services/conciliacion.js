// Núcleo de conciliación de saldos. Lógica pura + acceso a datos.
const { Op } = require('sequelize');
const db = require('../models');

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

// saldo_real del último cierre del par anterior a `periodo`, o el saldo_inicial configurado.
async function getSaldoBase({ usuario_id, metodopago_id, divisa_id, periodo }) {
  const ultimo = await db.Conciliaciones.findOne({
    where: { usuario_id, metodopago_id, divisa_id, periodo: { [Op.lt]: periodo } },
    order: [['periodo', 'DESC']]
  });
  if (ultimo) return parseFloat(ultimo.saldo_real);

  const inicial = await db.SaldosIniciales.findOne({ where: { metodopago_id, divisa_id } });
  return inicial ? parseFloat(inicial.saldo_inicial) : 0;
}

// Suma ingresos/egresos de Gastos del par dentro del rango (excluye ajustes de conciliación).
async function sumarMovimientos({ usuario_id, metodopago_id, divisa_id, inicio, fin }) {
  const gastos = await db.Gastos.findAll({
    where: {
      usuario_id,
      metodopago_id,
      divisa_id,
      conciliacion_id: null,
      fecha: { [Op.between]: [inicio + ' 00:00:00', fin + ' 23:59:59'] }
    },
    include: [{ model: db.TiposTransacciones, attributes: ['descripcion'] }]
  });
  let ingresos = 0, egresos = 0;
  for (const g of gastos) {
    const monto = parseFloat(g.monto);
    if (getSignoTipo(g.TiposTransaccione?.descripcion) === 1) ingresos += monto;
    else egresos += monto;
  }
  return { ingresos, egresos };
}

// Teórico del par para el período: base + ingresos - egresos.
async function calcularTeorico({ usuario_id, metodopago_id, divisa_id, periodo, frecuencia }) {
  const { inicio, fin } = calcularRangoPeriodo(frecuencia, periodo);
  const saldo_base = await getSaldoBase({ usuario_id, metodopago_id, divisa_id, periodo });
  const { ingresos, egresos } = await sumarMovimientos({ usuario_id, metodopago_id, divisa_id, inicio, fin });
  const saldo_teorico = Number((saldo_base + ingresos - egresos).toFixed(2));
  return { saldo_base, ingresos, egresos, saldo_teorico, inicio, fin };
}

// Pares (cuenta, divisa) a conciliar = los que tienen saldo_inicial cargado y cuenta activa.
async function listarPendientes({ usuario_id, frecuencia, periodo }) {
  const cuentasActivas = await db.CuentasConciliables.findAll({
    where: { usuario_id, activo: true }
  });
  const idsActivos = new Set(cuentasActivas.map(c => c.metodopago_id));

  const pares = await db.SaldosIniciales.findAll({
    where: { usuario_id },
    include: [
      { model: db.MetodosPagos, attributes: ['id', 'descripcion'] },
      { model: db.Divisas, attributes: ['id', 'descripcion'] }
    ]
  });

  const resultado = [];
  for (const p of pares) {
    if (!idsActivos.has(p.metodopago_id)) continue;
    const ya = await db.Conciliaciones.findOne({
      where: { metodopago_id: p.metodopago_id, divisa_id: p.divisa_id, periodo }
    });
    if (ya) continue; // ya cerrado para este período
    const calc = await calcularTeorico({
      usuario_id, metodopago_id: p.metodopago_id, divisa_id: p.divisa_id, periodo, frecuencia
    });
    resultado.push({
      metodopago_id: p.metodopago_id,
      metodopago: p.MetodosPago?.descripcion,
      divisa_id: p.divisa_id,
      divisa: p.Divisa?.descripcion,
      periodo,
      saldo_base: calc.saldo_base,
      saldo_teorico: calc.saldo_teorico
    });
  }
  return resultado;
}

module.exports = {
  getSignoTipo, addDays, calcularRangoPeriodo,
  getSaldoBase, sumarMovimientos, calcularTeorico, listarPendientes
};
