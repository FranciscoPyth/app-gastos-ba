const { fetchMedia } = require('./media');
const { sendText } = require('./sender');
const { transcribeAudio } = require('../ai/transcribe');
const { analyzeInvoiceImage } = require('../ai/visionInvoice');
const { chat } = require('../ai/agent');
const { buildFromWaId } = require('../../utils/userContext');

async function extractText(message) {
  if (message.type === 'text') {
    return message.text?.body || '';
  }
  if (message.type === 'audio') {
    const { buffer, mimeType } = await fetchMedia(message.audio.id);
    return await transcribeAudio({ buffer, mimeType });
  }
  if (message.type === 'image') {
    const { buffer, mimeType } = await fetchMedia(message.image.id);
    return await analyzeInvoiceImage({ buffer, mimeType });
  }
  return null;
}

async function handleEvent(body) {
  try {
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        const messages = value.messages || [];
        const contacts = value.contacts || [];
        const phoneNumberId = value.metadata?.phone_number_id;

        for (const message of messages) {
          const waId = message.from || contacts[0]?.wa_id;
          if (!waId) continue;

          let userText;
          try {
            userText = await extractText(message);
          } catch (err) {
            console.error('[inboundHandler] Error extrayendo texto:', err.message);
            await sendText({ to: waId, text: 'No pude procesar tu mensaje. ¿Podés reenviarlo?', phoneNumberId });
            continue;
          }

          if (!userText) {
            await sendText({ to: waId, text: 'Por ahora solo proceso texto, audio o imágenes 🙏', phoneNumberId });
            continue;
          }

          const userContext = await buildFromWaId(waId);

          let reply;
          try {
            reply = await chat({ waId, userText, userContext });
          } catch (err) {
            console.error('[inboundHandler] Error en agente IA:', err.response?.data || err.message);
            reply = 'Tuve un problema procesando tu mensaje 😓. Intentá de nuevo en un momento.';
          }

          if (reply) {
            await sendText({ to: waId, text: reply, phoneNumberId });
          }
        }
      }
    }
  } catch (err) {
    console.error('[inboundHandler] Error general:', err);
  }
}

module.exports = { handleEvent };
