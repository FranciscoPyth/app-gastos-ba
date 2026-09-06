const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const db = require('../models');
const { authenticateJWT } = require('../security/auth');
const { lunesActual, semanaAnterior } = require('../utils/semana');

router.use(authenticateJWT);

// Estado (sin requerir el flag): el front decide mostrar/ocultar la pestaña.
router.get('/status', async (req, res) => {
  try {
    const u = await db.Usuarios.findByPk(res.locals.user.id, { attributes: ['secretario_habilitado'] });
    res.json({ habilitado: !!(u && u.secretario_habilitado) });
  } catch (e) { res.status(500).json({ message: 'Error' }); }
});

// El resto requiere secretario habilitado.
router.use(async (req, res, next) => {
  try {
    const u = await db.Usuarios.findByPk(res.locals.user.id, { attributes: ['secretario_habilitado'] });
    if (!u || !u.secretario_habilitado) return res.status(403).json({ message: 'Secretario no habilitado' });
    next();
  } catch (e) { res.status(500).json({ message: 'Error' }); }
});

router.get('/categorias', async (req, res) => {
  const cats = await db.AgendaCategorias.findAll({ where: { user_id: res.locals.user.id, activo: true }, order: [['orden', 'ASC'], ['id', 'ASC']] });
  res.json(cats.map(c => ({ id: c.id, nombre: c.nombre })));
});

// ---------- Recordatorios (AgendaItems) ----------
router.get('/items', async (req, res) => {
  const where = { user_id: res.locals.user.id };
  if (!req.query.incluir_hechos) where.estado = 'pendiente';
  if (req.query.desde || req.query.hasta) {
    where.fecha = {};
    if (req.query.desde) where.fecha[Op.gte] = req.query.desde;
    if (req.query.hasta) where.fecha[Op.lte] = req.query.hasta;
  }
  if (req.query.categoria) where.categoria = req.query.categoria;
  const rows = await db.AgendaItems.findAll({ where, order: [['fecha', 'ASC'], ['hora', 'ASC'], ['id', 'ASC']], limit: 300 });
  res.json(rows);
});

router.post('/items', async (req, res) => {
  const { texto, categoria, fecha, hora } = req.body || {};
  if (!texto) return res.status(400).json({ message: 'texto requerido' });
  const row = await db.AgendaItems.create({
    user_id: res.locals.user.id, texto: String(texto).slice(0, 500),
    categoria: categoria || null, fecha: fecha || null, hora: hora || null,
    estado: 'pendiente', recordado: false, created_at: new Date()
  });
  res.json(row);
});

router.put('/items/:id', async (req, res) => {
  const row = await db.AgendaItems.findOne({ where: { id: req.params.id, user_id: res.locals.user.id } });
  if (!row) return res.status(404).json({ message: 'No encontrado' });
  const { texto, categoria, fecha, hora, estado } = req.body || {};
  if (texto !== undefined) row.texto = String(texto).slice(0, 500);
  if (categoria !== undefined) row.categoria = categoria || null;
  if (fecha !== undefined) row.fecha = fecha || null;
  if (hora !== undefined) row.hora = hora || null;
  if (estado !== undefined && ['pendiente', 'hecho'].includes(estado)) row.estado = estado;
  await row.save();
  res.json(row);
});

router.delete('/items/:id', async (req, res) => {
  const n = await db.AgendaItems.destroy({ where: { id: req.params.id, user_id: res.locals.user.id } });
  if (!n) return res.status(404).json({ message: 'No encontrado' });
  res.json({ ok: true });
});

// ---------- Objetivos semanales ----------
function conLogrado(r) {
  const meta = r.meta != null ? Number(r.meta) : null;
  const progreso = Number(r.progreso);
  return { id: r.id, texto: r.texto, categoria: r.categoria, meta, progreso, completado: !!r.completado, logrado: r.completado || (meta != null && progreso >= meta), semana: r.semana };
}

router.get('/objetivos', async (req, res) => {
  const semana = (req.query.semana && /^\d{4}-\d{2}-\d{2}$/.test(req.query.semana)) ? req.query.semana : lunesActual();
  const rows = await db.ObjetivosSemanales.findAll({ where: { user_id: res.locals.user.id, semana }, order: [['id', 'ASC']] });
  res.json({ semana, objetivos: rows.map(conLogrado) });
});

router.post('/objetivos', async (req, res) => {
  const { texto, meta, categoria, semana } = req.body || {};
  if (!texto) return res.status(400).json({ message: 'texto requerido' });
  const sem = (semana && /^\d{4}-\d{2}-\d{2}$/.test(semana)) ? semana : lunesActual();
  const row = await db.ObjetivosSemanales.create({
    user_id: res.locals.user.id, semana: sem, texto: String(texto).slice(0, 300),
    categoria: categoria || null, meta: (meta != null && meta !== '' ? Number(meta) : null),
    progreso: 0, completado: false, created_at: new Date()
  });
  res.json(conLogrado(row));
});

router.put('/objetivos/:id', async (req, res) => {
  const row = await db.ObjetivosSemanales.findOne({ where: { id: req.params.id, user_id: res.locals.user.id } });
  if (!row) return res.status(404).json({ message: 'No encontrado' });
  const { progreso, completado, texto, meta, categoria } = req.body || {};
  if (progreso !== undefined) row.progreso = Number(progreso) || 0;
  if (completado !== undefined) row.completado = !!completado;
  if (texto !== undefined) row.texto = String(texto).slice(0, 300);
  if (meta !== undefined) row.meta = (meta === null || meta === '') ? null : Number(meta);
  if (categoria !== undefined) row.categoria = categoria || null;
  await row.save();
  res.json(conLogrado(row));
});

router.delete('/objetivos/:id', async (req, res) => {
  const n = await db.ObjetivosSemanales.destroy({ where: { id: req.params.id, user_id: res.locals.user.id } });
  if (!n) return res.status(404).json({ message: 'No encontrado' });
  res.json({ ok: true });
});

router.post('/objetivos/copiar', async (req, res) => {
  const userId = res.locals.user.id;
  const semana = lunesActual();
  const yaHay = await db.ObjetivosSemanales.count({ where: { user_id: userId, semana } });
  if (yaHay) return res.status(409).json({ message: 'La semana ya tiene objetivos' });
  const prev = await db.ObjetivosSemanales.findAll({ where: { user_id: userId, semana: semanaAnterior(semana) } });
  for (const o of prev) {
    await db.ObjetivosSemanales.create({ user_id: userId, semana, texto: o.texto, categoria: o.categoria, meta: o.meta, progreso: 0, completado: false, created_at: new Date() });
  }
  res.json({ copiados: prev.length, semana });
});

module.exports = router;
