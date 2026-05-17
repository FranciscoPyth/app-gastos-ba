const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../models');
const { authenticateJWT } = require('../security/auth');
const mp = require('../utils/mercadopago');
const { syncOne } = require('../utils/mpSync');

// GET /api/mercadopago/status — estado de la conexión del usuario actual
router.get('/status', authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const cuenta = await db.MercadoPagoCuentas.findOne({
            where: { user_id: userId },
            attributes: ['id', 'mp_user_id', 'expires_at', 'last_sync_at', 'estado', 'scope', 'created_at']
        });

        res.json({
            configured: mp.isConfigured(),
            connected: !!cuenta,
            account: cuenta || null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/mercadopago/connect — devuelve URL OAuth de MP para que el FE redirija
router.get('/connect', authenticateJWT, async (req, res) => {
    try {
        if (!mp.isConfigured()) {
            return res.status(503).json({ error: 'MP no configurado en el backend (faltan MP_CLIENT_ID / MP_CLIENT_SECRET)' });
        }
        // El state lleva el user_id firmado para validarlo en el callback.
        const state = jwt.sign(
            { user_id: res.locals.user.id, t: Date.now() },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: '10m' }
        );
        const authUrl = mp.buildAuthUrl(state);
        res.json({ authUrl });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/mercadopago/callback — MP redirige al usuario aquí después de autorizar
// Nota: este endpoint NO requiere JWT del usuario (no lleva headers), pero validamos
// el state firmado para confirmar identidad.
router.get('/callback', async (req, res) => {
    try {
        const { code, state, error } = req.query;
        if (error) {
            return res.redirect(`${getFrontendUrl()}/dashboard?mp_error=${encodeURIComponent(error)}`);
        }
        if (!code || !state) {
            return res.status(400).send('Faltan code/state');
        }

        let decoded;
        try {
            decoded = jwt.verify(state, process.env.ACCESS_TOKEN_SECRET);
        } catch (e) {
            return res.status(400).send('state inválido o expirado');
        }
        const userId = decoded.user_id;

        const tokenData = await mp.exchangeCodeForToken(code);
        await mp.saveAccount(userId, tokenData);

        return res.redirect(`${getFrontendUrl()}/dashboard?mp_connected=1`);
    } catch (error) {
        console.error('[mp callback] error:', error.response ? error.response.data : error.message);
        return res.redirect(`${getFrontendUrl()}/dashboard?mp_error=${encodeURIComponent('exchange_failed')}`);
    }
});

// DELETE /api/mercadopago/disconnect
router.delete('/disconnect', authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const cuenta = await db.MercadoPagoCuentas.findOne({ where: { user_id: userId } });
        if (!cuenta) return res.status(404).json({ error: 'No hay cuenta conectada' });
        await cuenta.destroy();
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/mercadopago/sync — trigger manual de sync para el user actual
router.post('/sync', authenticateJWT, async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const force = !!req.body.force;
        const result = await syncOne(userId, { force });
        if (!result.ok) {
            return res.status(400).json({ error: result.reason });
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/mercadopago/webhook — notificaciones IPN/Webhook desde MP
// MP envía: { id, live_mode, type, date_created, application_id, user_id, version, api_version, action, data: { id } }
// No requiere JWT (es público). Guardamos el evento y disparamos sync para ese user.
router.post('/webhook', async (req, res) => {
    try {
        // Respondemos 200 rápido — MP reintenta si tardamos demasiado o fallamos.
        res.status(200).send('ok');

        const { type, data, user_id: mpUserId } = req.body || {};
        if (!type || !data || !data.id) return;

        // Resolvemos qué usuario de nuestra app corresponde por el mpUserId
        const cuenta = await db.MercadoPagoCuentas.findOne({ where: { mp_user_id: String(mpUserId) } });
        if (!cuenta) {
            console.log(`[mp webhook] mp_user_id ${mpUserId} no está registrado en nuestra DB`);
            return;
        }

        // Registramos el evento crudo (idempotencia por mp_resource_id)
        const resourceId = String(data.id);
        const existing = await db.MercadoPagoEventos.findOne({ where: { mp_resource_id: resourceId } });
        if (existing) return;

        await db.MercadoPagoEventos.create({
            user_id: cuenta.user_id,
            mp_resource_id: resourceId,
            mp_resource_type: type,
            origen: 'webhook',
            raw_payload: req.body,
            procesado: false
        });

        // Disparamos un sync (mismo flujo que polling) — el sync va a procesar este evento.
        syncOne(cuenta.user_id).catch(err => console.error('[mp webhook] sync error:', err.message));
    } catch (error) {
        console.error('[mp webhook] error:', error.message);
    }
});

function getFrontendUrl() {
    return process.env.FRONTEND_URL || 'http://localhost:3000';
}

module.exports = router;
