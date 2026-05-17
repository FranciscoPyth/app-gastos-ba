const axios = require('axios');

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v22.0';

async function getMediaUrl(mediaId) {
  const token = process.env.WHATSAPP_TOKEN;
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`;
  const r = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return { url: r.data.url, mimeType: r.data.mime_type, sha256: r.data.sha256 };
}

async function downloadMedia(url) {
  const token = process.env.WHATSAPP_TOKEN;
  const r = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer'
  });
  return Buffer.from(r.data);
}

async function fetchMedia(mediaId) {
  const meta = await getMediaUrl(mediaId);
  const buffer = await downloadMedia(meta.url);
  return { buffer, mimeType: meta.mimeType };
}

module.exports = { getMediaUrl, downloadMedia, fetchMedia };
