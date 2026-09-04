const axios = require('axios');
const { toTelegramHtml, toPlain } = require('../../utils/telegramFormat');

function apiUrl(method) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return `https://api.telegram.org/bot${token}/${method}`;
}

// Envía texto por Telegram formateando el markdown (estilo WhatsApp) a HTML, para
// que *negrita*/_itálica_ se rendericen y no aparezcan los asteriscos literales.
// Si el parseo HTML fallara, reintenta en texto plano para no perder el mensaje.
async function sendText({ chatId, text }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Telegram sender] Falta TELEGRAM_BOT_TOKEN. Skipping send.');
    return null;
  }

  try {
    const r = await axios.post(apiUrl('sendMessage'), {
      chat_id: chatId,
      text: toTelegramHtml(text),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
    return r.data;
  } catch (err) {
    console.error('[Telegram sender] Error (HTML), reintento en plano:', err.response?.data || err.message);
    try {
      const r = await axios.post(apiUrl('sendMessage'), {
        chat_id: chatId,
        text: toPlain(text),
        disable_web_page_preview: true
      });
      return r.data;
    } catch (err2) {
      console.error('[Telegram sender] Error (plano):', err2.response?.data || err2.message);
      throw err2;
    }
  }
}

module.exports = { sendText, apiUrl };
