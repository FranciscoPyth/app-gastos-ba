// Secretario (Fase 1): avisos de agenda por el canal del usuario (Telegram si vinculado).
const { Op } = require('sequelize');
const db = require('../models');
const { notifyUser } = require('./notify');
const { lunesActual } = require('../utils/semana');

function fmtObjetivo(o) {
  const meta = o.meta != null ? Number(o.meta) : null;
  const progreso = Number(o.progreso);
  const logrado = o.completado || (meta != null && progreso >= meta);
  const marca = logrado ? '✅' : '⬜';
  const detalle = meta != null ? ` (${progreso}/${meta})` : '';
  return `${marca} ${o.texto}${detalle}`;
}

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

// Cierre de la semana (domingo): repaso de objetivos logrados.
async function runCierreObjetivos() {
  const semana = lunesActual();
  const usuarios = await db.Usuarios.findAll({ where: { secretario_habilitado: true } });
  let enviados = 0;
  for (const u of usuarios) {
    const objetivos = await db.ObjetivosSemanales.findAll({ where: { user_id: u.id, semana }, order: [['id', 'ASC']] });
    if (!objetivos.length) continue;
    const logrados = objetivos.filter(o => o.completado || (o.meta != null && Number(o.progreso) >= Number(o.meta))).length;
    const lineas = objetivos.map(fmtObjetivo).join('\n');
    const text = `🏁 Cierre de la semana${u.username ? ', ' + u.username : ''}: lograste *${logrados}/${objetivos.length}* objetivos.\n${lineas}`;
    try { await notifyUser(u, { text }); enviados++; } catch (e) { console.error('[secretario] cierre objetivos error:', e.response?.data || e.message); }
  }
  console.log(`[secretario] cierres de objetivos enviados: ${enviados}`);
  return { enviados };
}

// Empujón a mitad de semana (miércoles): cómo viene el progreso.
async function runEmpujonObjetivos() {
  const semana = lunesActual();
  const usuarios = await db.Usuarios.findAll({ where: { secretario_habilitado: true } });
  let enviados = 0;
  for (const u of usuarios) {
    const objetivos = await db.ObjetivosSemanales.findAll({ where: { user_id: u.id, semana }, order: [['id', 'ASC']] });
    if (!objetivos.length) continue;
    const pendientes = objetivos.filter(o => !(o.completado || (o.meta != null && Number(o.progreso) >= Number(o.meta))));
    if (!pendientes.length) continue;
    const lineas = pendientes.map(fmtObjetivo).join('\n');
    const text = `💪 Mitad de semana. Te queda pendiente:\n${lineas}\n¡Dale que llegás!`;
    try { await notifyUser(u, { text }); enviados++; } catch (e) { console.error('[secretario] empujón objetivos error:', e.response?.data || e.message); }
  }
  console.log(`[secretario] empujones de objetivos enviados: ${enviados}`);
  return { enviados };
}

module.exports = { runRecordatoriosPuntuales, runResumenDiarioAgenda, runCierreObjetivos, runEmpujonObjetivos };
