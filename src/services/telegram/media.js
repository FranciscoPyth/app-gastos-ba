const axios = require('axios');
const { apiUrl } = require('./sender');

// Descarga un archivo de Telegram por file_id.
// Telegram no expone mime_type en getFile, así que el caller lo pasa según el
// tipo de mensaje (voice → audio/ogg, photo → image/jpeg).
async function fetchMedia(fileId, mimeType) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  const meta = await axios.get(apiUrl('getFile'), { params: { file_id: fileId } });
  const filePath = meta.data?.result?.file_path;
  if (!filePath) throw new Error('Telegram getFile sin file_path');

  const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const r = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  return { buffer: Buffer.from(r.data), mimeType };
}

module.exports = { fetchMedia };
