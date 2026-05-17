const { Op } = require('sequelize');
const { Usuarios, GastosPruebaN8N, TarjetasCredito } = require('../models');
const { sendText } = require('./whatsapp/sender');
const { enrichTarjeta } = require('../utils/tarjetas');

function getArgentinaDateParts() {
  const msAr = Date.now() - 3 * 60 * 60 * 1000;
  const fecha = new Date(msAr);
  return {
    isoDate: fecha.toISOString().split('T')[0],
    hour: fecha.getUTCHours()
  };
}

function saludoSegun(hora) {
  if (hora >= 5 && hora < 12) return '¡Buen día';
  if (hora >= 12 && hora < 20) return '¡Buenas tardes';
  return '¡Buenas noches';
}

function formatearTarjetasAlerta(tarjetasProximas) {
  if (!tarjetasProximas || tarjetasProximas.length === 0) return '';
  let bloque = '\n\n💳 *Tarjetas próximas:*\n';
  for (const t of tarjetasProximas) {
    if (t.dias_al_vencimiento <= 3 && t.dias_al_vencimiento >= 0) {
      bloque += `⚠️ *${t.nombre}* vence en *${t.dias_al_vencimiento} día${t.dias_al_vencimiento !== 1 ? 's' : ''}* — consumo $${Number(t.consumo_periodo).toLocaleString('es-AR')} ${t.divisa_resumen}\n`;
    } else if (t.dias_al_cierre <= 3 && t.dias_al_cierre >= 0) {
      bloque += `📅 *${t.nombre}* cierra en *${t.dias_al_cierre} día${t.dias_al_cierre !== 1 ? 's' : ''}* — consumo $${Number(t.consumo_periodo).toLocaleString('es-AR')} ${t.divisa_resumen}\n`;
    } else if (t.dias_al_vencimiento < 0) {
      bloque += `🚨 *${t.nombre}* VENCIDA hace ${Math.abs(t.dias_al_vencimiento)} día${Math.abs(t.dias_al_vencimiento) !== 1 ? 's' : ''}\n`;
    }
  }
  return bloque;
}

function formatear({ nombre, gastosHoy, tarjetasProximas }) {
  const { hour } = getArgentinaDateParts();
  const saludo = saludoSegun(hour);
  const usuario = nombre || 'amigo/a';
  const alertasTarjeta = formatearTarjetasAlerta(tarjetasProximas);

  if (gastosHoy.length === 0) {
    return `*${saludo}, ${usuario}!* 👋\n\nHasta ahora no registramos ningún movimiento hoy. ¡Es un excelente día para tus ahorros! 💸✨${alertasTarjeta}\n\nSi te olvidaste de anotar algo, todavía estás a tiempo. 🚀\n\n🔗 https://controlalo.com.ar/`;
  }

  let total = 0;
  let detalle = '';
  for (const g of gastosHoy) {
    const monto = parseFloat(g.monto);
    total += monto;
    detalle += `🔹 ${g.descripcion}: *$${monto.toLocaleString('es-AR')}* _(${g.categoria || 'Sin categoría'})_\n`;
  }

  return `*${saludo}, ${usuario}!* 📊\n\nEste es el resumen de tus movimientos de hoy:\n\n${detalle}\n💰 *Total del día: $${total.toLocaleString('es-AR')}*${alertasTarjeta}\n\n¡Genial! Sigue así y no pierdas el rastro de tu dinero. 💪\n\n👉 https://controlalo.com.ar/`;
}

async function runDailySummary() {
  console.log('[dailySummary] Ejecutando resumen diario...');
  const { isoDate } = getArgentinaDateParts();

  const usuarios = await Usuarios.findAll({
    where: { telefono: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } }
  });

  for (const u of usuarios) {
    try {
      const telefono = u.telefono;
      if (!telefono) continue;

      // Variantes para soportar formatos viejos (sin 549)
      const variantes = [telefono];
      if (telefono.startsWith('549')) variantes.push(telefono.substring(3));

      const gastos = await GastosPruebaN8N.findAll({
        where: {
          numero_cel: { [Op.in]: variantes },
          fecha: isoDate
        },
        order: [['created_at', 'ASC']]
      });

      // Tarjetas próximas a cerrar/vencer (≤3 días) o vencidas
      let tarjetasProximas = [];
      try {
        const tarjetas = await TarjetasCredito.findAll({ where: { user_id: u.id, estado: 'activa' } });
        const enriched = await Promise.all(tarjetas.map(t => enrichTarjeta(t)));
        tarjetasProximas = enriched.filter(t =>
          (t.dias_al_cierre <= 3 && t.dias_al_cierre >= 0) ||
          t.dias_al_vencimiento <= 3
        );
      } catch (e) {
        console.warn('[dailySummary] tarjetas check failed:', e.message);
      }

      const mensaje = formatear({ nombre: u.username, gastosHoy: gastos, tarjetasProximas });
      await sendText({ to: telefono, text: mensaje });
      console.log(`[dailySummary] Resumen enviado a ${u.username} (${telefono}) - ${gastos.length} mov.`);
    } catch (err) {
      console.error(`[dailySummary] Error con usuario ${u.id}:`, err.response?.data || err.message);
    }
  }
  console.log('[dailySummary] Resumen diario finalizado.');
}

module.exports = { runDailySummary, formatear };
