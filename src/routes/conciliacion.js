const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../security/auth');
const db = require('../models');
const conciliacionSvc = require('../services/conciliacion');

// Fecha 'hoy' en Argentina (UTC-3) como YYYY-MM-DD.
function hoyArgentina() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
}

// GET /api/conciliacion/config
router.get('/config', authenticateJWT, async (req, res) => {
  try {
    const u = await db.Usuarios.findByPk(res.locals.user.id, { attributes: ['frecuencia_conciliacion'] });
    res.json({ frecuencia: u.frecuencia_conciliacion });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/conciliacion/config  { frecuencia }
router.put('/config', authenticateJWT, async (req, res) => {
  try {
    const { frecuencia } = req.body;
    if (!['diaria', 'semanal', 'quincenal', 'mensual'].includes(frecuencia)) {
      return res.status(400).json({ error: 'frecuencia inválida' });
    }
    await db.Usuarios.update({ frecuencia_conciliacion: frecuencia }, { where: { id: res.locals.user.id } });
    res.json({ frecuencia });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/conciliacion/cuentas -> metodos de pago con flag conciliable + saldos iniciales por divisa
router.get('/cuentas', authenticateJWT, async (req, res) => {
  try {
    const usuario_id = res.locals.user.id;
    const [metodos, conciliables, saldos] = await Promise.all([
      db.MetodosPagos.findAll({ where: { usuario_id }, order: [['descripcion', 'ASC']] }),
      db.CuentasConciliables.findAll({ where: { usuario_id } }),
      db.SaldosIniciales.findAll({ where: { usuario_id } })
    ]);
    const activoPorMetodo = new Map(conciliables.map(c => [c.metodopago_id, c.activo]));
    res.json(metodos.map(m => ({
      metodopago_id: m.id,
      descripcion: m.descripcion,
      activo: activoPorMetodo.get(m.id) || false,
      saldos_iniciales: saldos
        .filter(s => s.metodopago_id === m.id)
        .map(s => ({ divisa_id: s.divisa_id, saldo_inicial: parseFloat(s.saldo_inicial), fecha: s.fecha }))
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/conciliacion/cuentas
//   { cuentas: [{ metodopago_id, activo, saldos_iniciales: [{ divisa_id, saldo_inicial, fecha }] }] }
router.put('/cuentas', authenticateJWT, async (req, res) => {
  try {
    const usuario_id = res.locals.user.id;
    const { cuentas } = req.body;
    if (!Array.isArray(cuentas)) return res.status(400).json({ error: 'cuentas debe ser un array' });

    for (const c of cuentas) {
      const [reg] = await db.CuentasConciliables.findOrCreate({
        where: { usuario_id, metodopago_id: c.metodopago_id },
        defaults: { activo: !!c.activo }
      });
      if (reg.activo !== !!c.activo) { reg.activo = !!c.activo; await reg.save(); }

      for (const s of (c.saldos_iniciales || [])) {
        const [si] = await db.SaldosIniciales.findOrCreate({
          where: { metodopago_id: c.metodopago_id, divisa_id: s.divisa_id },
          defaults: { usuario_id, saldo_inicial: s.saldo_inicial, fecha: s.fecha }
        });
        si.saldo_inicial = s.saldo_inicial;
        si.fecha = s.fecha;
        si.usuario_id = usuario_id;
        await si.save();
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/conciliacion/pendientes?periodo=YYYY-MM-DD (default hoy)
router.get('/pendientes', authenticateJWT, async (req, res) => {
  try {
    const usuario_id = res.locals.user.id;
    const periodo = req.query.periodo || hoyArgentina();
    const u = await db.Usuarios.findByPk(usuario_id, { attributes: ['frecuencia_conciliacion'] });
    const pendientes = await conciliacionSvc.listarPendientes({
      usuario_id, frecuencia: u.frecuencia_conciliacion, periodo
    });
    res.json({ periodo, cuentas: pendientes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/conciliacion/cerrar  { periodo, cuentas: [{ metodopago_id, divisa_id, saldo_real, accion }] }
router.post('/cerrar', authenticateJWT, async (req, res) => {
  try {
    const usuario_id = res.locals.user.id;
    const { periodo, cuentas } = req.body;
    if (!periodo || !Array.isArray(cuentas) || cuentas.length === 0) {
      return res.status(400).json({ error: 'periodo y cuentas son requeridos' });
    }
    const u = await db.Usuarios.findByPk(usuario_id, { attributes: ['frecuencia_conciliacion'] });
    const resumen = await conciliacionSvc.cerrarLote({
      usuario_id, periodo, cuentas, frecuencia: u.frecuencia_conciliacion
    });
    res.json(resumen);
  } catch (e) {
    if (e.code === 'YA_CONCILIADO') return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/conciliacion/historial?metodopago_id=&divisa_id=
router.get('/historial', authenticateJWT, async (req, res) => {
  try {
    const usuario_id = res.locals.user.id;
    const where = { usuario_id };
    if (req.query.metodopago_id) where.metodopago_id = req.query.metodopago_id;
    if (req.query.divisa_id) where.divisa_id = req.query.divisa_id;
    const rows = await db.Conciliaciones.findAll({ where, order: [['periodo', 'DESC']], limit: 90 });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
