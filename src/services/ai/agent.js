const { getClient, MODEL } = require('./openaiClient');
const { buildSystemMessage } = require('./prompts');
const { toolDefinitions, runTool } = require('./tools');
const memory = require('./memory');

const MAX_ITERATIONS = 5;

async function chat({ waId, userText, userContext }) {
  const client = getClient();
  const history = await memory.loadWindow(waId);

  const messages = [
    { role: 'system', content: buildSystemMessage(userContext) },
    ...history,
    { role: 'user', content: userText }
  ];

  let finalContent = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: toolDefinitions,
      tool_choice: 'auto'
    });

    const msg = response.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      finalContent = msg.content || '';
      break;
    }

    for (const tc of msg.tool_calls) {
      const name = tc.function.name;
      let args = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch (_) {
        args = {};
      }
      let toolResult;
      try {
        toolResult = await runTool(name, args, {
          numero_cel: userContext.numero_cel,
          userId: userContext.userId
        });
        console.log(`[agent] tool=${name} args=${JSON.stringify(args)} ok`);
      } catch (err) {
        toolResult = { error: err.response?.data || err.message };
        console.error(`[agent] tool=${name} args=${JSON.stringify(args)} ERROR:`, toolResult.error);
      }
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult)
      });
    }
  }

  if (finalContent === null) {
    finalContent = 'Disculpá, no pude completar la operación. ¿Podés repetirlo?';
  }

  await memory.appendTurn(waId, userText, finalContent);
  return finalContent;
}

module.exports = { chat };
