// CRUD de suscripciones recurrentes (Netflix, Apple, Claude, gimnasio, etc.).
// Las suscripciones NO generan filas en GastosPruebaN8N. Aparecen como items
// virtuales en el resumen de tarjeta (si tienen tarjeta_id) y el egreso real
// se materializa cuando se paga el resumen de la tarjeta.

const express = require('express');
const router = express.Router();
const db = require('../models');
const { authenticateJWT } = require('../security/auth');
const { normalizarTelefono } = require('../utils/phoneUtils');
const { Op } = require('sequelize');

// Middleware combinado: API Key (sistema/IA) o JWT (usuario web)
const combinedAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey && apiKey === process.env.API_KEY) {
        req.isSystem = true;
        return next();
    }
    authenticateJWT(req, res, next);
};

// Resuelve user_id desde numero_cel tolerando los formatos con/sin +, con/sin 549, etc.
// Mismo criterio que ia-integration.getUserIdByPhone.
async function getUserIdByPhone(numero_cel) {
    if (!numero_cel) return null;
    const tel = normalizarTelefono(numero_cel);
    let u = await db.Usuarios.findOne({ where: { telefono: tel } });
    if (u) return u.id;
    const numeroLocal = tel.replace(/^549/, '');
    u = await db.Usuarios.findOne({
        where: { [Op.or]: [{ telefono: { [Op.like]: '%' + numeroLocal + '%' } }] }
    });
    if (u) return u.id;
    const adicional = await db.UsuarioTelefonos.findOne({
        where: {
            [Op.or]: [
                { telefono: tel },
                { telefono: { [Op.like]: '%' + numeroLocal + '%' } }
            ]
        }
    });
    return adicional ? adicional.user_id : null;
}

// GET /api/suscripciones — lista del user
router.get('/', combinedAuth, async (req, res) => {
    try {
        let userId;
        if (req.isSystem) {
            userId = await getUserIdByPhone(req.query.numero_cel);
            if (!userId) return res.status(404).json({ error: 'Usuario no encontrado' });
        } else {
            userId = res.locals.user.id;
        }

        const where = { user_id: userId };
        if (req.query.estado) where.estado = req.query.estado;
        if (req.query.tarjeta_id) where.tarjeta_id = parseInt(req.query.tarjeta_id);

        const suscripciones = await db.Suscripciones.findAll({
            where,
            order: [['estado', 'ASC'], ['dia_cobro', 'ASC']]
        });
        res.json(suscripciones);
    } catch (error) {
        console.error('[suscripciones] list error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/suscripciones — crear
router.post('/', combinedAuth, async (req, res) => {
    try {
        let userId;
        if (req.isSystem) {
            userId = await getUserIdByPhone(req.body.numero_cel);
            if (!userId) return res.status(404).json({ error: 'Usuario no encontrado' });
        } else {
            userId = res.locals.user.id;
        }

        const {
            descripcion, monto, divisa, dia_cobro,
            tarjeta_id, metodo_pago, categoria,
            fecha_inicio, fecha_fin
        } = req.body;

        if (!descripcion || monto == null || !divisa || !dia_cobro) {
            return res.status(400).json({
                error: 'descripcion, monto, divisa y dia_cobro son requeridos'
            });
        }
        const dia = parseInt(dia_cobro);
        if (isNaN(dia) || dia < 1 || dia > 31) {
            return res.status(400).json({ error: 'dia_cobro debe estar entre 1 y 31' });
        }

        // Si vino tarjeta como ID, validar pertenencia
        let resolvedTarjetaId = null;
        if (tarjeta_id) {
            const t = await db.TarjetasCredito.findOne({
                where: { id: parseInt(tarjeta_id), user_id: userId }
            });
            if (!t) return res.status(400).json({ error: 'tarjeta_id no pertenece al usuario' });
            resolvedTarjetaId = t.id;
        }

        const s = await db.Suscripciones.create({
            user_id: userId,
            descripcion,
            monto: parseFloat(monto),
            divisa,
            dia_cobro: dia,
            tarjeta_id: resolvedTarjetaId,
            metodo_pago: metodo_pago || null,
            categoria: categoria || 'Suscripciones',
            fecha_inicio: fecha_inicio || new Date().toISOString().split('T')[0],
            fecha_fin: fecha_fin || null,
            estado: 'activa'
        });
        res.status(201).json(s);
    } catch (error) {
        console.error('[suscripciones] crear error:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/suscripciones/:id — editar / pausar / reactivar
router.put('/:id', combinedAuth, async (req, res) => {
    try {
        let userId;
        if (req.isSystem) {
            userId = await getUserIdByPhone(req.body.numero_cel);
            if (!userId) return res.status(404).json({ error: 'Usuario no encontrado' });
        } else {
            userId = res.locals.user.id;
        }

        const s = await db.Suscripciones.findOne({
            where: { id: req.params.id, user_id: userId }
        });
        if (!s) return res.status(404).json({ error: 'Suscripción no encontrada' });

        const editable = ['descripcion', 'monto', 'divisa', 'dia_cobro', 'tarjeta_id',
                          'metodo_pago', 'categoria', 'fecha_inicio', 'fecha_fin', 'estado'];
        const updates = {};
        for (const k of editable) {
            if (k in req.body) updates[k] = req.body[k];
        }
        if ('tarjeta_id' in updates && updates.tarjeta_id) {
            const t = await db.TarjetasCredito.findOne({
                where: { id: parseInt(updates.tarjeta_id), user_id: userId }
            });
            if (!t) return res.status(400).json({ error: 'tarjeta_id no pertenece al usuario' });
        }
        await s.update(updates);
        res.json(s);
    } catch (error) {
        console.error('[suscripciones] update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/suscripciones/:id — soft delete (cancela)
router.delete('/:id', combinedAuth, async (req, res) => {
    try {
        let userId;
        if (req.isSystem) {
            userId = await getUserIdByPhone(req.body.numero_cel || req.query.numero_cel);
            if (!userId) return res.status(404).json({ error: 'Usuario no encontrado' });
        } else {
            userId = res.locals.user.id;
        }

        const s = await db.Suscripciones.findOne({
            where: { id: req.params.id, user_id: userId }
        });
        if (!s) return res.status(404).json({ error: 'Suscripción no encontrada' });

        // Soft delete: marca cancelada y setea fecha_fin = hoy
        await s.update({
            estado: 'cancelada',
            fecha_fin: new Date().toISOString().split('T')[0]
        });
        res.json({ ok: true, suscripcion: s });
    } catch (error) {
        console.error('[suscripciones] delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
