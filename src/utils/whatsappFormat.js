// Normaliza Markdown estándar al formato que SÍ renderiza WhatsApp.
// WhatsApp soporta: *negrita* (un asterisco), _itálica_, ~tachado~, ```mono```.
// NO soporta: **negrita**, encabezados #, ni tablas.
//
// Es la red de seguridad para la salida de la IA (que tiende a emitir Markdown
// estándar) y es IDEMPOTENTE sobre texto ya bien formateado: `*x*`, `_x_` y URLs
// sueltas no matchean ninguna transformación, así que los mensajes automáticos
// (dailySummary, conciliación) quedan intactos.
function toWhatsApp(text) {
  if (!text || typeof text !== 'string') return text;
  let out = text;

  // Links Markdown [texto](url) -> "texto: url" (WhatsApp auto-linkea URLs sueltas)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2');

  // Negrita doble **x** / __x__ -> *x*  (antes de tocar encabezados)
  out = out.replace(/\*\*(.+?)\*\*/g, '*$1*');
  out = out.replace(/__(.+?)__/g, '*$1*');

  // Encabezados Markdown "### Título" -> "*Título*" (quita #, deja la línea en negrita)
  out = out.replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*$/gm, (m, h) => {
    const inner = h.replace(/^\*+|\*+$/g, '').trim(); // evita *...* duplicado
    return `*${inner}*`;
  });

  // Colapsa 3+ saltos de línea a 2
  out = out.replace(/\n{3,}/g, '\n\n');

  return out;
}

module.exports = { toWhatsApp };
