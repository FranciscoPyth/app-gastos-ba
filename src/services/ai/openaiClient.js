const OpenAI = require('openai');

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY no está configurada');
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';

module.exports = { getClient, MODEL, VISION_MODEL };
