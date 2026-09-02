const { Op } = require('sequelize');
const { Usuarios, CuentasConciliables } = require('../models');
const conciliacionSvc = require('./conciliacion');
const { notifyUser } = require('./notify');

function fechaArgentina() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}

// ¿hoy cierra un período para esta frecuencia?
function cierraHoy(frecuencia, fecha) {
  const dia = fecha.getUTCDate();
  const dow = fecha.getUTCDay(); // 0=domingo
  const finDeMes = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)).getUTCDate();
  switch (frecuencia) {
    case 'semanal':   return dow === 0;                 // domingo
    case 'quincenal': return dia === 15 || dia === finDeMes;
    case 'mensual':   return dia === finDeMes;          // último día del mes
    case 'diaria':
    default:          return true;
  }
}

function formatearMensaje(nombre, cuentas) {
  const lineas = cuentas.map(c =>
    `• *${c.metodopago}* (${c.divisa}): $${Number(c.saldo_teorico).toLocaleString('es-AR')}`
  ).join('\n');
  return `*Hola, ${nombre || 'amigo/a'}!* 🧮\n\nSegún tus movimientos, tus cuentas terminaron:\n\n${lineas}\n\n¿Está todo bien? Si algo no coincide, decime cuál y cuánto. 👇`;
}

async function runConciliacionReminder() {
  console.log('[conciliacionReminder] inicio');
  const fecha = fechaArgentina();
  const periodo = fecha.toISOString().split('T')[0];

  const usuarios = await Usuarios.findAll({
    where: {
      [Op.or]: [
        { telefono: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
        { telegram_chat_id: { [Op.ne]: null } }
      ]
    }
  });

  const horaActual = fecha.getUTCHours(); // hora ART (fecha ya viene corrida -3h)

  for (const u of usuarios) {
    try {
      if (u.hora_conciliacion !== horaActual) continue;
      if (!cierraHoy(u.frecuencia_conciliacion, fecha)) continue;

      const tieneCuentas = await CuentasConciliables.count({ where: { usuario_id: u.id, activo: true } });
      if (!tieneCuentas) continue;

      const cuentas = await conciliacionSvc.listarPendientes({
        usuario_id: u.id, frecuencia: u.frecuencia_conciliacion, periodo
      });
      if (cuentas.length === 0) continue;

      const res = await notifyUser(u, { text: formatearMensaje(u.username, cuentas) });
      console.log(`[conciliacionReminder] enviado a ${u.username} (${res?.canal || 'sin canal'}, ${cuentas.length} cuentas)`);
    } catch (err) {
      console.error(`[conciliacionReminder] error usuario ${u.id}:`, err.response?.data || err.message);
    }
  }
  console.log('[conciliacionReminder] fin');
}

module.exports = { runConciliacionReminder, cierraHoy, formatearMensaje };
