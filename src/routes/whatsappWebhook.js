const express = require('express');
const router = express.Router();
const { handleEvent } = require('../services/whatsapp/inboundHandler');

// Verificación inicial del webhook (Meta envía GET con hub.verify_token)
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Recepción de eventos
router.post('/webhook', (req, res) => {
  // Respondemos 200 inmediato para que Meta no reintente
  res.sendStatus(200);

  // Procesamiento async
  setImmediate(() => {
    handleEvent(req.body).catch(err => {
      console.error('[whatsappWebhook] handleEvent error:', err);
    });
  });
});

module.exports = router;
