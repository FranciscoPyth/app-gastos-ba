// Secretario (Fase 1): avisos de agenda por el canal del usuario (Telegram si vinculado).
const { Op } = require('sequelize');
const db = require('../models');
const { notifyUser } = require('./notify');

// Fecha y hora actuales en horario Argentina (UTC-3).
function ahoraAr() {
  const ar = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return {
    fecha: ar.toISOString().split('T')[0],       // YYYY-MM-DD
    hora: ar.toISOString().split('T')[1].slice(0, 5) // HH:MM
  };
}

// Avisos puntuales: ítems de hoy con hora <= ahora, pendientes y no recordados aún.
async function runRecordatoriosPuntuales() {
  const { fecha, hora } = ahoraAr();
  const items = await db.AgendaItems.findAll({
    where: {
      fecha,
      estado: 'pendiente',
      recordado: false,
      hora: { [Op.ne]: null, [Op.lte]: `${hora}:59` }
    },
    order: [['hora', 'ASC'], ['id', 'ASC']]
  });
  if (!items.length) return { enviados: 0 };

  const cacheUsuarios = {};
  let enviados = 0;
  for (const it of items) {
    if (!(it.user_id in cacheUsuarios)) cacheUsuarios[it.user_id] = await db.Usuarios.findByPk(it.user_id);
    const u = cacheUsuarios[it.user_id];
    // Marcamos recordado siempre (aunque el user no tenga secretario) para no reprocesar.
    if (u && u.secretario_habilitado) {
      const text = `⏰ Recordatorio: ${it.texto}${it.categoria ? ` (${it.categoria})` : ''}`;
      try { await notifyUser(u, { text }); enviados++; }
      catch (e) { console.error('[secretario] aviso puntual error:', e.response?.data || e.message); }
    }
    await it.update({ recordado: true });
  }
  console.log(`[secretario] recordatorios puntuales enviados: ${enviados}`);
  return { enviados };
}

// Resumen diario: por cada usuario con secretario, lo que tiene para hoy.
async function runResumenDiarioAgenda() {
  const { fecha } = ahoraAr();
  const usuarios = await db.Usuarios.findAll({ where: { secretario_habilitado: true } });
  let enviados = 0;
  for (const u of usuarios) {
    const items = await db.AgendaItems.findAll({
      where: { user_id: u.id, fecha, estado: 'pendiente' },
      order: [['hora', 'ASC'], ['id', 'ASC']]
    });
    if (!items.length) continue;
    const lineas = items.map(i =>
      `• ${i.hora ? String(i.hora).slice(0, 5) + ' ' : ''}${i.texto}${i.categoria ? ` (${i.categoria})` : ''}`
    ).join('\n');
    const text = `☀️ Buen día${u.username ? ', ' + u.username : ''}. Hoy tenés:\n${lineas}`;
    try { await notifyUser(u, { text }); enviados++; }
    catch (e) { console.error('[secretario] resumen error:', e.response?.data || e.message); }
  }
  console.log(`[secretario] resúmenes diarios enviados: ${enviados}`);
  return { enviados };
}

module.exports = { runRecordatoriosPuntuales, runResumenDiarioAgenda };
