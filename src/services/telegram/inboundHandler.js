const { Op } = require('sequelize');
const db = require('../../models');
const { fetchMedia } = require('./media');
const { sendText } = require('./sender');
const { transcribeAudio } = require('../ai/transcribe');
const { analyzeInvoiceImage } = require('../ai/visionInvoice');
const { chat } = require('../ai/agent');
const { buildFromUserId } = require('../../utils/userContext');

const WELCOME_NO_LINK =
  '¡Hola! 👋 Soy el asistente de Controlalo.\n\n' +
  'Este Telegram todavía no está conectado a una cuenta. Entrá a https://controlalo.com.ar/, ' +
  'iniciá sesión y tocá "Conectar Telegram" para vincularlo. Una vez conectado podés cargar y ' +
  'consultar tus gastos directamente desde acá. 💸';

// Extrae el texto del mensaje (texto directo, transcripción de voz o análisis de imagen).
async function extractText(message) {
  if (message.text) return message.text;

  if (message.voice) {
    const { buffer, mimeType } = await fetchMedia(message.voice.file_id, 'audio/ogg');
    return await transcribeAudio({ buffer, mimeType });
  }
  if (message.audio) {
    const { buffer, mimeType } = await fetchMedia(message.audio.file_id, message.audio.mime_type || 'audio/mpeg');
    return await transcribeAudio({ buffer, mimeType });
  }
  if (message.photo && message.photo.length) {
    // Telegram manda varios tamaños; el último es el de mayor resolución.
    const largest = message.photo[message.photo.length - 1];
    const { buffer, mimeType } = await fetchMedia(largest.file_id, 'image/jpeg');
    return await analyzeInvoiceImage({ buffer, mimeType });
  }
  return null;
}

// Vincula el chat de Telegram a una cuenta usando el token de deep-link (/start <token>).
async function handleLink(chatId, token) {
  const row = await db.TelegramLinkTokens.findOne({
    where: { token, expires_at: { [Op.gt]: new Date() } }
  });
  if (!row) {
    await sendText({ chatId, text: 'Ese enlace de conexión no es válido o expiró. Generá uno nuevo desde https://controlalo.com.ar/ 🙏' });
    return;
  }

  // Si este Telegram ya estaba vinculado a otra cuenta, lo reasignamos a esta.
  await db.Usuarios.update({ telegram_chat_id: null }, { where: { telegram_chat_id: chatId } });
  await db.Usuarios.update({ telegram_chat_id: chatId }, { where: { id: row.user_id } });
  await db.TelegramLinkTokens.destroy({ where: { token } });

  const usuario = await db.Usuarios.findByPk(row.user_id);
  await sendText({
    chatId,
    text: `¡Listo${usuario?.username ? ', ' + usuario.username : ''}! ✅ Tu Telegram quedó conectado a Controlalo. Ya podés cargar y consultar tus gastos desde acá.`
  });
}

async function handleUpdate(update) {
  try {
    const message = update.message || update.edited_message;
    if (!message) return; // ignoramos otros tipos de update (callbacks, etc.)

    const chatId = message.chat?.id;
    if (!chatId) return;

    // Comando /start (con o sin token de vinculación)
    if (typeof message.text === 'string' && message.text.startsWith('/start')) {
      const parts = message.text.trim().split(/\s+/);
      const token = parts[1];
      if (token) return await handleLink(chatId, token);
      await sendText({ chatId, text: WELCOME_NO_LINK });
      return;
    }

    const usuario = await db.Usuarios.findOne({ where: { telegram_chat_id: chatId } });
    if (!usuario) {
      await sendText({ chatId, text: WELCOME_NO_LINK });
      return;
    }

    let userText;
    try {
      userText = await extractText(message);
    } catch (err) {
      console.error('[telegram inbound] Error extrayendo texto:', err.message);
      await sendText({ chatId, text: 'No pude procesar tu mensaje. ¿Podés reenviarlo?' });
      return;
    }

    if (!userText) {
      await sendText({ chatId, text: 'Por ahora solo proceso texto, audio o imágenes 🙏' });
      return;
    }

    const userContext = await buildFromUserId(usuario.id);
    // Clave de historial: reusamos el teléfono normalizado para unificar la memoria
    // del asistente con WhatsApp; si el usuario no tiene teléfono, usamos el chat de Telegram.
    const convKey = userContext.numero_cel || `tg:${chatId}`;

    let reply;
    try {
      reply = await chat({ waId: convKey, userText, userContext });
    } catch (err) {
      console.error('[telegram inbound] Error en agente IA:', err.response?.data || err.message);
      reply = 'Tuve un problema procesando tu mensaje 😓. Intentá de nuevo en un momento.';
    }

    if (reply) await sendText({ chatId, text: reply });
  } catch (err) {
    console.error('[telegram inbound] Error general:', err);
  }
}

module.exports = { handleUpdate };
