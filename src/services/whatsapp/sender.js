const axios = require('axios');

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v22.0';

async function sendText({ to, text, phoneNumberId }) {
  const token = process.env.WHATSAPP_TOKEN;
  const fromId = phoneNumberId || process.env.WHATSAPP_PHONE_ID;

  if (!token || !fromId) {
    console.warn('[WhatsApp sender] Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID. Skipping send.');
    return null;
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${fromId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text }
  };

  try {
    const r = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return r.data;
  } catch (err) {
    console.error('[WhatsApp sender] Error:', err.response?.data || err.message);
    throw err;
  }
}

module.exports = { sendText };
