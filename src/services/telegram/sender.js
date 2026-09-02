const axios = require('axios');

function apiUrl(method) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return `https://api.telegram.org/bot${token}/${method}`;
}

// Envía texto por Telegram. Sin parse_mode: el texto va literal (evita errores de
// escaping de MarkdownV2). El asistente ya responde en lenguaje natural.
async function sendText({ chatId, text }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Telegram sender] Falta TELEGRAM_BOT_TOKEN. Skipping send.');
    return null;
  }

  try {
    const r = await axios.post(apiUrl('sendMessage'), {
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    });
    return r.data;
  } catch (err) {
    console.error('[Telegram sender] Error:', err.response?.data || err.message);
    throw err;
  }
}

module.exports = { sendText, apiUrl };
