// Convierte el texto (que puede venir con markdown estilo WhatsApp: *negrita*,
// **negrita**, _itálica_) a HTML válido para Telegram (parse_mode=HTML).
// Telegram HTML solo requiere escapar & < >, y los tags se insertan siempre
// balanceados, así que el resultado no rompe el parseo.
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toTelegramHtml(text) {
  if (text == null) return '';
  let t = escapeHtml(String(text));
  // Negrita: **texto** primero, luego *texto* (contenido no vacío, sin el delimitador ni salto).
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  t = t.replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
  // Itálica: _texto_
  t = t.replace(/_([^_\n]+)_/g, '<i>$1</i>');
  return t;
}

// Quita todo marcador/markdown y tags: fallback en texto plano si el envío HTML falla.
function toPlain(text) {
  if (text == null) return '';
  return String(text)
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1');
}

module.exports = { toTelegramHtml, toPlain };
