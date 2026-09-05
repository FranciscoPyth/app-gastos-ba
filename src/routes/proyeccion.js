const express = require('express');
const router = express.Router();
const db = require('../models');
const { authenticateJWT } = require('../security/auth');

router.use(authenticateJWT);

async function getCfg(userId) {
  let c = await db.ProyeccionConfig.findByPk(userId);
  if (!c) {
    c = await db.ProyeccionConfig.create({
      user_id: userId, aporte_mensual_usd: 0, horizonte_meses: 12,
      rendimiento_anual_pct: 0, meta_usd: null, updated_at: new Date(),
    });
  }
  return c;
}

function out(c) {
  return {
    aporte_mensual_usd: Number(c.aporte_mensual_usd),
    horizonte_meses: c.horizonte_meses,
    rendimiento_anual_pct: Number(c.rendimiento_anual_pct),
    meta_usd: c.meta_usd === null || c.meta_usd === undefined ? null : Number(c.meta_usd),
  };
}

// GET /api/proyeccion
router.get('/', async (req, res) => {
  try {
    const c = await getCfg(res.locals.user.id);
    res.json(out(c));
  } catch (err) {
    console.error('[proyeccion] GET error:', err.message);
    res.status(500).json({ message: 'Error obteniendo proyección' });
  }
});

// PUT /api/proyeccion
router.put('/', async (req, res) => {
  try {
    const c = await getCfg(res.locals.user.id);
    const { aporte_mensual_usd, horizonte_meses, rendimiento_anual_pct, meta_usd } = req.body || {};
    if (aporte_mensual_usd !== undefined) c.aporte_mensual_usd = Number(aporte_mensual_usd) || 0;
    if (horizonte_meses !== undefined) c.horizonte_meses = Math.max(1, Math.min(600, parseInt(horizonte_meses, 10) || 12));
    if (rendimiento_anual_pct !== undefined) c.rendimiento_anual_pct = Number(rendimiento_anual_pct) || 0;
    if (meta_usd !== undefined) c.meta_usd = (meta_usd === null || meta_usd === '') ? null : (Number(meta_usd) || 0);
    c.updated_at = new Date();
    await c.save();
    res.json(out(c));
  } catch (err) {
    console.error('[proyeccion] PUT error:', err.message);
    res.status(500).json({ message: 'Error guardando proyección' });
  }
});

module.exports = router;
