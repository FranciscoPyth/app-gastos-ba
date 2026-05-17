const { ChatMessages } = require('../../models');

const WINDOW_SIZE = parseInt(process.env.CHAT_MEMORY_WINDOW || '8', 10);

async function loadWindow(waId, n = WINDOW_SIZE) {
  const rows = await ChatMessages.findAll({
    where: { wa_id: waId },
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit: n
  });
  return rows
    .reverse()
    .map(r => ({ role: r.role, content: r.content }));
}

async function appendTurn(waId, userMsg, assistantMsg) {
  const now = new Date();
  await ChatMessages.bulkCreate([
    { wa_id: waId, role: 'user', content: userMsg, created_at: now },
    { wa_id: waId, role: 'assistant', content: assistantMsg || '', created_at: new Date(now.getTime() + 1) }
  ]);
}

module.exports = { loadWindow, appendTurn, WINDOW_SIZE };
