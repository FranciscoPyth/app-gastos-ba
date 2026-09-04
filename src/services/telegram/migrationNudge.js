const crypto = require('crypto');
const db = require('../../models');
const { sendText: sendWhatsapp } = require('../whatsapp/sender');

const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 1 aviso por día como máximo
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;       // el link vale 24h

function mensaje(botUsername, token) {
  const link = `https://t.me/${botUsername}?start=${token}`;
  return (
    '👋 Te cuento: estamos migrando el asistente de Controlalo de WhatsApp a *Telegram*. ' +
    'Es más rápido y nos permite mantener el servicio *gratis* (WhatsApp empezó a cobrarnos 😅).\n\n' +
    `Pasate en un toque 👉 ${link}\n` +
    'Abrí el link, tocá *Start* y tu cuenta queda conectada. Seguís cargando y consultando tus gastos igual que ahora.\n\n' +
    'En las próximas semanas vamos a dejar de responder por WhatsApp, así que te recomiendo migrar cuando puedas. 🙌'
  );
}

// Manda (una vez por día) un aviso por WhatsApp invitando a migrar a Telegram,
// con un deep-link ya vinculado a la cuenta del usuario. No aplica si el usuario
// ya tiene Telegram vinculado. Va como respuesta dentro de la ventana de 24h → sin costo.
// No lanza: cualquier error se loguea y se ignora para no romper el flujo del inbound.
async function maybeSendWhatsappMigrationNudge(usuario) {
  try {
    if (!usuario || usuario.telegram_chat_id) return;
    if (!usuario.telefono) return;

    const botUsername = process.env.TELEGRAM_BOT_USERNAME;
    if (!botUsername) return; // sin bot configurado no hay a dónde migrar

    const last = usuario.telegram_nudge_at ? new Date(usuario.telegram_nudge_at).getTime() : 0;
    if (Date.now() - last < NUDGE_COOLDOWN_MS) return;

    const now = new Date();
    const token = crypto.randomBytes(24).toString('hex');
    await db.TelegramLinkTokens.create({
      token, user_id: usuario.id, created_at: now, expires_at: new Date(now.getTime() + TOKEN_TTL_MS)
    });

    await sendWhatsapp({ to: usuario.telefono, text: mensaje(botUsername, token) });
    await db.Usuarios.update({ telegram_nudge_at: now }, { where: { id: usuario.id } });
    console.log(`[migrationNudge] aviso enviado a user ${usuario.id}`);
  } catch (err) {
    console.error('[migrationNudge] error:', err.response?.data || err.message);
  }
}

module.exports = { maybeSendWhatsappMigrationNudge };
