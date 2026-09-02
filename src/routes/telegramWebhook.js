const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../models');
const { authenticateJWT } = require('../security/auth');
const { handleUpdate } = require('../services/telegram/inboundHandler');

const LINK_TOKEN_TTL_MIN = 15;

// Recepción de updates de Telegram. Se valida el secret token que Telegram
// reenvía en el header (se configura al registrar el webhook con setWebhook).
router.post('/webhook', (req, res) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.sendStatus(401);
  }

  // 200 inmediato para que Telegram no reintente; procesamos async.
  res.sendStatus(200);
  setImmediate(() => {
    handleUpdate(req.body).catch(err => {
      console.error('[telegramWebhook] handleUpdate error:', err);
    });
  });
});

// Genera un token de vinculación y devuelve el deep-link del bot.
// El front lo abre (t.me/<bot>?start=<token>); al recibir /start <token> el bot
// asocia el chat de Telegram a esta cuenta.
router.post('/link-token', authenticateJWT, async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const botUsername = process.env.TELEGRAM_BOT_USERNAME;
    if (!botUsername) {
      return res.status(500).json({ message: 'TELEGRAM_BOT_USERNAME no configurado' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LINK_TOKEN_TTL_MIN * 60 * 1000);

    // Limpiamos tokens previos del usuario para no acumular.
    await db.TelegramLinkTokens.destroy({ where: { user_id: userId } });
    await db.TelegramLinkTokens.create({
      token, user_id: userId, created_at: now, expires_at: expiresAt
    });

    return res.json({
      url: `https://t.me/${botUsername}?start=${token}`,
      expires_at: expiresAt.toISOString()
    });
  } catch (err) {
    console.error('[telegramWebhook] link-token error:', err.message);
    return res.status(500).json({ message: 'No se pudo generar el enlace de Telegram' });
  }
});

// Estado de vinculación del usuario (para que el front muestre conectado/no).
router.get('/status', authenticateJWT, async (req, res) => {
  try {
    const usuario = await db.Usuarios.findByPk(res.locals.user.id, { attributes: ['telegram_chat_id'] });
    return res.json({ linked: !!(usuario && usuario.telegram_chat_id) });
  } catch (err) {
    return res.status(500).json({ message: 'Error consultando estado de Telegram' });
  }
});

// Desvincula el Telegram de la cuenta.
router.delete('/link', authenticateJWT, async (req, res) => {
  try {
    await db.Usuarios.update({ telegram_chat_id: null }, { where: { id: res.locals.user.id } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Error desvinculando Telegram' });
  }
});

module.exports = router;
