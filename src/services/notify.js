const tg = require('./telegram/sender');
const wa = require('./whatsapp/sender');

// Envía una notificación al usuario por su canal preferido.
//   - Telegram si la cuenta está vinculada (gratis, sin ventana de 24h).
//   - WhatsApp en caso contrario (template si se pasa uno, para entregar fuera
//     de la ventana de 24h; si no, texto libre).
// Devuelve { canal } para logging, o null si no se pudo enviar por ningún canal.
async function notifyUser(user, { text, whatsappTemplate, whatsappTemplateLang, whatsappParams } = {}) {
  if (user && user.telegram_chat_id) {
    await tg.sendText({ chatId: user.telegram_chat_id, text });
    return { canal: 'telegram' };
  }
  // Corte de avisos automáticos por WhatsApp (migración a Telegram). No afecta al
  // asistente inbound ni al aviso de migración, que se mandan por otra vía.
  if (process.env.DISABLE_WHATSAPP_NOTIFICATIONS === 'true') {
    return { canal: 'omitido_whatsapp_desactivado' };
  }
  if (!user || !user.telefono) return null;
  if (whatsappTemplate) {
    await wa.sendTemplate({
      to: user.telefono,
      templateName: whatsappTemplate,
      languageCode: whatsappTemplateLang || 'es',
      bodyParams: whatsappParams || []
    });
    return { canal: 'whatsapp_template' };
  }
  await wa.sendText({ to: user.telefono, text });
  return { canal: 'whatsapp_text' };
}

module.exports = { notifyUser };
