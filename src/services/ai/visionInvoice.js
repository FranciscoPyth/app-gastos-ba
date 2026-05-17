const { getClient, VISION_MODEL } = require('./openaiClient');

const PROMPT = 'Necesito que extraigas los datos más relevantes de la factura, tales como: Fecha, Descripción, Monto, Medio de pago, Proyecto/Origen, Observaciones. Respondé en texto plano en español.';

async function analyzeInvoiceImage({ buffer, mimeType }) {
  const client = getClient();
  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${buffer.toString('base64')}`;

  const r = await client.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]
  });

  return r.choices[0]?.message?.content || '';
}

module.exports = { analyzeInvoiceImage };
