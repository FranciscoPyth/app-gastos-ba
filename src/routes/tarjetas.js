const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const db = require('../models');
const { authenticateJWT } = require('../security/auth');
const { enrichTarjeta, getResumenPeriodo, nextCierre, vencimientoForCierre, daysBetween } = require('../utils/tarjetas');
const { normalizarTelefono } = require('../utils/phoneUtils');

// GET /api/tarjetas — lista enriquecida
router.get('/', authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const tarjetas = await db.TarjetasCredito.findAll({
            where: { user_id: userId },
            order: [['created_at', 'DESC']]
        });
        const enriched = await Promise.all(tarjetas.map(t => enrichTarjeta(t)));
        res.json(enriched);
    } catch (error) {
        console.error('[tarjetas] error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/tarjetas — crear
router.post('/', authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const { nombre, ultimos_4, divisa_resumen, dia_cierre, dia_vencimiento, limite, color } = req.body;
        if (!nombre || !dia_cierre || !dia_vencimiento) {
            return res.status(400).json({ error: 'nombre, dia_cierre y dia_vencimiento son requeridos' });
        }
        const t = await db.TarjetasCredito.create({
            user_id: userId,
            nombre,
            ultimos_4: ultimos_4 || null,
            divisa_resumen: divisa_resumen || 'ARS',
            dia_cierre: parseInt(dia_cierre),
            dia_vencimiento: parseInt(dia_vencimiento),
            limite: limite ? parseFloat(limite) : null,
            color: color || '#64D888',
            estado: 'activa'
        });
        res.status(201).json(t);
    } catch (error) {
        console.error('[tarjetas] crear error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/tarjetas/:id
router.put('/:id', authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const t = await db.TarjetasCredito.findOne({ where: { id: req.params.id, user_id: userId } });
        if (!t) return res.status(404).json({ error: 'Tarjeta no encontrada' });
        const editable = ['nombre', 'ultimos_4', 'divisa_resumen', 'dia_cierre', 'dia_vencimiento', 'limite', 'color', 'estado'];
        const updates = {};
        for (const k of editable) if (k in req.body) updates[k] = req.body[k];
        await t.update(updates);
        res.json(t);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/tarjetas/:id
router.delete('/:id', authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const t = await db.TarjetasCredito.findOne({ where: { id: req.params.id, user_id: userId } });
        if (!t) return res.status(404).json({ error: 'Tarjeta no encontrada' });
        // Desvincular gastos asociados antes de borrar
        await db.Gastos.update({ tarjeta_id: null }, { where: { tarjeta_id: t.id, usuario_id: userId } });
        await t.destroy();
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/tarjetas/:id/resumen — período actual con cuotas detalladas
router.get('/:id/resumen', authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const t = await db.TarjetasCredito.findOne({ where: { id: req.params.id, user_id: userId } });
        if (!t) return res.status(404).json({ error: 'Tarjeta no encontrada' });

        const resumen = await getResumenPeriodo(t);
        res.json(resumen);
    } catch (error) {
        console.error('[tarjetas] resumen error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/tarjetas/:id/pagar-resumen — registra el egreso real
// body: { monto, fecha?, divisa? }
router.post('/:id/pagar-resumen', authenticateJWT, async (req, res) => {
    const trx = await db.sequelize.transaction();
    try {
        const userId = res.locals.user.id;
        const t = await db.TarjetasCredito.findOne({ where: { id: req.params.id, user_id: userId }, transaction: trx });
        if (!t) { await trx.rollback(); return res.status(404).json({ error: 'Tarjeta no encontrada' }); }

        const monto = parseFloat(req.body.monto);
        if (!monto || monto <= 0) { await trx.rollback(); return res.status(400).json({ error: 'monto inválido' }); }

        const fecha = req.body.fecha || new Date().toISOString().split('T')[0];
        const divisa = req.body.divisa || t.divisa_resumen || 'ARS';

        const usuario = await db.Usuarios.findByPk(userId);
        const cel = usuario && usuario.telefono ? normalizarTelefono(usuario.telefono) : '0000000000';

        // Egreso real en GastosPruebaN8N (categoría 'Pago Tarjeta')
        const gasto = await db.GastosPruebaN8N.create({
            numero_cel: cel,
            descripcion: `Pago resumen tarjeta: ${t.nombre}`,
            monto,
            fecha,
            divisa,
            tipos_transaccion: 'Gasto',
            metodo_pago: t.nombre,
            categoria: 'Pago Tarjeta'
        }, { transaction: trx });

        await trx.commit();
        res.json({ ok: true, gasto });
    } catch (error) {
        await trx.rollback();
        console.error('[tarjetas] pagar-resumen error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/tarjetas/proximas?dias=7 — útil para alertas
router.get('/alertas/proximas', authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const dias = parseInt(req.query.dias || '7');
        const tarjetas = await db.TarjetasCredito.findAll({ where: { user_id: userId, estado: 'activa' } });
        const enriched = await Promise.all(tarjetas.map(t => enrichTarjeta(t)));
        const proximas = enriched.filter(t => t.dias_al_cierre <= dias || t.dias_al_vencimiento <= dias);
        res.json(proximas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
