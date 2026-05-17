const { toFile } = require('openai');
const { getClient } = require('./openaiClient');

async function transcribeAudio({ buffer, mimeType }) {
  const client = getClient();

  // Whisper espera mp3, mpeg, wav, m4a, mp4, mpga, webm. WhatsApp suele dar audio/ogg (opus).
  // Forzamos extensión apropiada según mime.
  let ext = 'ogg';
  if (mimeType) {
    if (mimeType.includes('mpeg') || mimeType.includes('mp3')) ext = 'mp3';
    else if (mimeType.includes('wav')) ext = 'wav';
    else if (mimeType.includes('webm')) ext = 'webm';
    else if (mimeType.includes('mp4') || mimeType.includes('m4a')) ext = 'm4a';
    else if (mimeType.includes('ogg')) ext = 'ogg';
  }

  const file = await toFile(buffer, `audio.${ext}`, { type: mimeType || 'audio/ogg' });

  const r = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'es'
  });
  return r.text;
}

module.exports = { transcribeAudio };
