const axios = require('axios');
const { toWhatsApp } = require('../../utils/whatsappFormat');

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v22.0';

async function sendText({ to, text, phoneNumberId }) {
  const token = process.env.WHATSAPP_TOKEN;
  const fromId = phoneNumberId || process.env.WHATSAPP_PHONE_ID;
  text = toWhatsApp(text);

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

// Envía un mensaje de TEMPLATE (HSM) aprobado en Meta. Necesario para mensajes
// proactivos fuera de la ventana de 24h (ej: re-enganche a usuarios inactivos).
// bodyParams: array de strings que llenan {{1}}, {{2}}, ... del body del template.
async function sendTemplate({ to, templateName, languageCode = 'es', bodyParams = [], phoneNumberId }) {
  const token = process.env.WHATSAPP_TOKEN;
  const fromId = phoneNumberId || process.env.WHATSAPP_PHONE_ID;

  if (!token || !fromId) {
    console.warn('[WhatsApp sender] Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID. Skipping send.');
    return null;
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${fromId}/messages`;
  const components = bodyParams.length
    ? [{ type: 'body', parameters: bodyParams.map(text => ({ type: 'text', text: String(text) })) }]
    : [];
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {})
    }
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
    console.error('[WhatsApp sender] Template error:', err.response?.data || err.message);
    throw err;
  }
}

module.exports = { sendText, sendTemplate };
