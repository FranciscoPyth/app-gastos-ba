const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../models');
const { authenticateJWT } = require('../security/auth');
const gcal = require('../services/googleCalendar');

function frontendUrl() { return process.env.FRONTEND_URL || 'https://controlalo.com.ar'; }

// GET /api/gcal/status
router.get('/status', authenticateJWT, async (req, res) => {
  try {
    const cuenta = await db.GoogleCalendarCuentas.findByPk(res.locals.user.id, { attributes: ['google_email', 'created_at'] });
    res.json({ configured: gcal.isConfigured(), connected: !!cuenta, email: cuenta ? cuenta.google_email : null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/gcal/connect — devuelve la URL de OAuth de Google
router.get('/connect', authenticateJWT, async (req, res) => {
  try {
    if (!gcal.isConfigured()) {
      return res.status(503).json({ error: 'Google Calendar no configurado en el backend (falta GOOGLE_CLIENT_SECRET).' });
    }
    const state = jwt.sign({ user_id: res.locals.user.id, t: Date.now() }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10m' });
    res.json({ authUrl: gcal.buildAuthUrl(state) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/gcal/callback — Google redirige acá tras autorizar
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`${frontendUrl()}/dashboard?gcal_error=${encodeURIComponent(error)}`);
    if (!code || !state) return res.status(400).send('Faltan code/state');

    let decoded;
    try { decoded = jwt.verify(state, process.env.ACCESS_TOKEN_SECRET); }
    catch (e) { return res.status(400).send('state inválido o expirado'); }

    const tokenData = await gcal.exchangeCodeForToken(code);
    await gcal.saveAccount(decoded.user_id, tokenData);
    return res.redirect(`${frontendUrl()}/dashboard?gcal_connected=1`);
  } catch (error) {
    console.error('[gcal callback] error:', error.response ? error.response.data : error.message);
    return res.redirect(`${frontendUrl()}/dashboard?gcal_error=${encodeURIComponent('exchange_failed')}`);
  }
});

// DELETE /api/gcal/disconnect
router.delete('/disconnect', authenticateJWT, async (req, res) => {
  try {
    const cuenta = await db.GoogleCalendarCuentas.findByPk(res.locals.user.id);
    if (!cuenta) return res.status(404).json({ error: 'No hay calendario conectado' });
    await cuenta.destroy();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
