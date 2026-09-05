const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const db = require('../models');
const { authenticateJWT } = require('../security/auth');
const { toArs, totales, round2 } = require('../services/presupuesto');
const { normalizarTelefono } = require('../utils/phoneUtils');

router.use(authenticateJWT);

function periodoActual() {
  const ar = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${ar.getUTCFullYear()}-${String(ar.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Cotización desde Patrimonio (Bloque 1); crea default si el user no tiene.
async function getCotizacion(userId) {
  let cfg = await db.PatrimonioConfig.findByPk(userId);
  if (!cfg) cfg = await db.PatrimonioConfig.create({ user_id: userId, usd_ars: 1000, eur_usd: 1.08, updated_at: new Date() });
  return { usd_ars: Number(cfg.usd_ars), eur_usd: Number(cfg.eur_usd) };
}

function monedaCanon(x) {
  const u = String(x || '').toUpperCase();
  if (u.includes('USD') || u.includes('DOL')) return 'USD';
  if (u.includes('EUR')) return 'EUR';
  return 'ARS';
}

// Suma de egresos del mes (referencia) desde Gastos + GastosPruebaN8N, convertido a ARS.
async function gastoRealArs(userId, periodo, cot) {
  const [y, m] = periodo.split('-').map(Number);
  if (!y || !m) return 0;
  const desde = `${periodo}-01`;
  const hasta = `${periodo}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const usuario = await db.Usuarios.findByPk(userId);
  const cel = usuario && usuario.telefono ? normalizarTelefono(usuario.telefono) : null;
  let total = 0;

  const gastos = await db.Gastos.findAll({
    where: { usuario_id: userId, fecha: { [Op.between]: [desde + ' 00:00:00', hasta + ' 23:59:59'] } },
    include: [{ model: db.Divisas, attributes: ['descripcion'] }, { model: db.TiposTransacciones, attributes: ['descripcion'] }],
  });
  for (const g of gastos) {
    if (String((g.TiposTransaccion && g.TiposTransaccion.descripcion) || '').toLowerCase().includes('ingreso')) continue;
    total += toArs(g.monto, monedaCanon(g.Divisa && g.Divisa.descripcion), cot);
  }

  if (cel) {
    const gn = await db.GastosPruebaN8N.findAll({ where: { numero_cel: cel, fecha: { [Op.between]: [desde, hasta] } } });
    for (const g of gn) {
      if (String(g.tipos_transaccion || '').toLowerCase().includes('ingreso')) continue;
      total += toArs(g.monto, monedaCanon(g.divisa), cot);
    }
  }
  return round2(total);
}

// GET /api/presupuesto?periodo=YYYY-MM
router.get('/', async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const periodo = (req.query.periodo && /^\d{4}-\d{2}$/.test(req.query.periodo)) ? req.query.periodo : periodoActual();
    const [lineas, cot] = await Promise.all([
      db.PresupuestoLineas.findAll({ where: { user_id: userId, periodo, activo: true }, order: [['rol', 'ASC'], ['orden', 'ASC'], ['id', 'ASC']] }),
      getCotizacion(userId),
    ]);
    const ingresos = lineas.filter(l => l.rol === 'ingreso');
    const asignaciones = lineas.filter(l => l.rol === 'asignacion');
    const gasto_real_ars = await gastoRealArs(userId, periodo, cot);
    res.json({ periodo, cotizacion: cot, ingresos, asignaciones, totales: totales(ingresos, asignaciones, cot), gasto_real_ars });
  } catch (err) {
    console.error('[presupuesto] GET error:', err.message);
    res.status(500).json({ message: 'Error obteniendo presupuesto' });
  }
});

// POST /api/presupuesto/lineas
router.post('/lineas', async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const { periodo, rol, nombre, monto, moneda } = req.body || {};
    if (!/^\d{4}-\d{2}$/.test(periodo || '') || !['ingreso', 'asignacion'].includes(rol) || !nombre || !['USD', 'ARS', 'EUR'].includes(moneda)) {
      return res.status(400).json({ message: 'Datos inválidos' });
    }
    const l = await db.PresupuestoLineas.create({ user_id: userId, periodo, rol, nombre: String(nombre).slice(0, 100), monto: Number(monto) || 0, moneda, activo: true });
    res.json(l);
  } catch (err) {
    console.error('[presupuesto] POST error:', err.message);
    res.status(500).json({ message: 'Error creando línea' });
  }
});

// PUT /api/presupuesto/lineas/:id
router.put('/lineas/:id', async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const l = await db.PresupuestoLineas.findOne({ where: { id: req.params.id, user_id: userId } });
    if (!l) return res.status(404).json({ message: 'Línea no encontrada' });
    const { nombre, monto, moneda, rol } = req.body || {};
    if (nombre !== undefined) l.nombre = String(nombre).slice(0, 100);
    if (monto !== undefined) l.monto = Number(monto) || 0;
    if (moneda !== undefined && ['USD', 'ARS', 'EUR'].includes(moneda)) l.moneda = moneda;
    if (rol !== undefined && ['ingreso', 'asignacion'].includes(rol)) l.rol = rol;
    await l.save();
    res.json(l);
  } catch (err) {
    console.error('[presupuesto] PUT error:', err.message);
    res.status(500).json({ message: 'Error editando línea' });
  }
});

// DELETE /api/presupuesto/lineas/:id
router.delete('/lineas/:id', async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const n = await db.PresupuestoLineas.update({ activo: false }, { where: { id: req.params.id, user_id: userId } });
    if (!n[0]) return res.status(404).json({ message: 'Línea no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[presupuesto] DELETE error:', err.message);
    res.status(500).json({ message: 'Error eliminando línea' });
  }
});

// POST /api/presupuesto/copiar
router.post('/copiar', async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const { periodo_origen, periodo_destino } = req.body || {};
    if (!/^\d{4}-\d{2}$/.test(periodo_origen || '') || !/^\d{4}-\d{2}$/.test(periodo_destino || '')) {
      return res.status(400).json({ message: 'Periodos inválidos' });
    }
    const yaHay = await db.PresupuestoLineas.count({ where: { user_id: userId, periodo: periodo_destino, activo: true } });
    if (yaHay) return res.status(409).json({ message: 'El mes destino ya tiene líneas' });
    const origen = await db.PresupuestoLineas.findAll({ where: { user_id: userId, periodo: periodo_origen, activo: true } });
    for (const l of origen) {
      await db.PresupuestoLineas.create({ user_id: userId, periodo: periodo_destino, rol: l.rol, nombre: l.nombre, monto: l.monto, moneda: l.moneda, orden: l.orden, activo: true });
    }
    res.json({ copiadas: origen.length });
  } catch (err) {
    console.error('[presupuesto] copiar error:', err.message);
    res.status(500).json({ message: 'Error copiando mes' });
  }
});

module.exports = router;
