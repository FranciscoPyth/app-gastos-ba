const express = require('express');
const router = express.Router();
const db = require('../models');
const { authenticateJWT } = require('../security/auth');
const { totales } = require('../services/patrimonio');

router.use(authenticateJWT);

// Devuelve (creándola si no existe) la config de cotización del usuario.
async function getConfig(userId) {
  let cfg = await db.PatrimonioConfig.findByPk(userId);
  if (!cfg) {
    cfg = await db.PatrimonioConfig.create({ user_id: userId, usd_ars: 1000, eur_usd: 1.08, updated_at: new Date() });
  }
  return cfg;
}

function periodoActual() {
  // 'YYYY-MM' en horario Argentina (UTC-3)
  const ar = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${ar.getUTCFullYear()}-${String(ar.getUTCMonth() + 1).padStart(2, '0')}`;
}

// GET /api/patrimonio — posiciones + cotización + totales + última foto
router.get('/', async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const [posiciones, cfg, ultimaFoto] = await Promise.all([
      db.PatrimonioPosiciones.findAll({ where: { user_id: userId, activo: true }, order: [['tipo', 'ASC'], ['orden', 'ASC'], ['id', 'ASC']] }),
      getConfig(userId),
      db.PatrimonioSnapshots.findOne({ where: { user_id: userId }, order: [['periodo', 'DESC']] }),
    ]);
    const cotizacion = { usd_ars: Number(cfg.usd_ars), eur_usd: Number(cfg.eur_usd) };
    res.json({ posiciones, cotizacion, totales: totales(posiciones, cotizacion), ultima_foto: ultimaFoto });
  } catch (err) {
    console.error('[patrimonio] GET error:', err.message);
    res.status(500).json({ message: 'Error obteniendo patrimonio' });
  }
});

// POST /api/patrimonio/posiciones — crea
router.post('/posiciones', async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const { billetera, moneda, tipo, saldo } = req.body || {};
    if (!billetera || !['USD', 'ARS', 'EUR'].includes(moneda) || !['ahorro', 'inversion'].includes(tipo)) {
      return res.status(400).json({ message: 'Datos inválidos (billetera, moneda, tipo requeridos)' });
    }
    const pos = await db.PatrimonioPosiciones.create({
      user_id: userId, billetera: String(billetera).slice(0, 100), moneda, tipo,
      saldo: Number(saldo) || 0, activo: true,
    });
    res.json(pos);
  } catch (err) {
    console.error('[patrimonio] POST posiciones error:', err.message);
    res.status(500).json({ message: 'Error creando posición' });
  }
});

// PUT /api/patrimonio/posiciones/:id — edita
router.put('/posiciones/:id', async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const pos = await db.PatrimonioPosiciones.findOne({ where: { id: req.params.id, user_id: userId } });
    if (!pos) return res.status(404).json({ message: 'Posición no encontrada' });
    const { billetera, moneda, tipo, saldo } = req.body || {};
    if (billetera !== undefined) pos.billetera = String(billetera).slice(0, 100);
    if (moneda !== undefined && ['USD', 'ARS', 'EUR'].includes(moneda)) pos.moneda = moneda;
    if (tipo !== undefined && ['ahorro', 'inversion'].includes(tipo)) pos.tipo = tipo;
    if (saldo !== undefined) pos.saldo = Number(saldo) || 0;
    await pos.save();
    res.json(pos);
  } catch (err) {
    console.error('[patrimonio] PUT posiciones error:', err.message);
    res.status(500).json({ message: 'Error editando posición' });
  }
});

// DELETE /api/patrimonio/posiciones/:id — baja lógica
router.delete('/posiciones/:id', async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const n = await db.PatrimonioPosiciones.update({ activo: false }, { where: { id: req.params.id, user_id: userId } });
    if (!n[0]) return res.status(404).json({ message: 'Posición no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[patrimonio] DELETE posiciones error:', err.message);
    res.status(500).json({ message: 'Error eliminando posición' });
  }
});

// PUT /api/patrimonio/cotizacion — upsert config
router.put('/cotizacion', async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const cfg = await getConfig(userId);
    const { usd_ars, eur_usd } = req.body || {};
    if (usd_ars !== undefined) cfg.usd_ars = Number(usd_ars) || cfg.usd_ars;
    if (eur_usd !== undefined) cfg.eur_usd = Number(eur_usd) || cfg.eur_usd;
    cfg.updated_at = new Date();
    await cfg.save();
    res.json({ usd_ars: Number(cfg.usd_ars), eur_usd: Number(cfg.eur_usd) });
  } catch (err) {
    console.error('[patrimonio] PUT cotizacion error:', err.message);
    res.status(500).json({ message: 'Error guardando cotización' });
  }
});

// POST /api/patrimonio/snapshot — guarda la foto del mes corriente (upsert por periodo)
router.post('/snapshot', async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const [posiciones, cfg] = await Promise.all([
      db.PatrimonioPosiciones.findAll({ where: { user_id: userId, activo: true } }),
      getConfig(userId),
    ]);
    const cotizacion = { usd_ars: Number(cfg.usd_ars), eur_usd: Number(cfg.eur_usd) };
    const t = totales(posiciones, cotizacion);
    const periodo = periodoActual();
    const payload = {
      user_id: userId, periodo, fecha: new Date(),
      total_usd: t.total_usd, ahorros_usd: t.ahorros_usd, inversiones_usd: t.inversiones_usd,
      usd_ars: cotizacion.usd_ars, eur_usd: cotizacion.eur_usd,
      detalle: posiciones.map(p => ({ billetera: p.billetera, moneda: p.moneda, tipo: p.tipo, saldo: Number(p.saldo) })),
    };
    const existing = await db.PatrimonioSnapshots.findOne({ where: { user_id: userId, periodo } });
    if (existing) { await existing.update(payload); res.json(existing); }
    else { const snap = await db.PatrimonioSnapshots.create(payload); res.json(snap); }
  } catch (err) {
    console.error('[patrimonio] POST snapshot error:', err.message);
    res.status(500).json({ message: 'Error guardando la foto del mes' });
  }
});

// GET /api/patrimonio/snapshots — evolución
router.get('/snapshots', async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const rows = await db.PatrimonioSnapshots.findAll({
      where: { user_id: userId }, order: [['periodo', 'ASC']],
      attributes: ['periodo', 'fecha', 'total_usd', 'ahorros_usd', 'inversiones_usd'],
    });
    res.json(rows);
  } catch (err) {
    console.error('[patrimonio] GET snapshots error:', err.message);
    res.status(500).json({ message: 'Error obteniendo evolución' });
  }
});

module.exports = router;
