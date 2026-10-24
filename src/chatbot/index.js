'use strict';
// Chatbot facade. The HTTP layer only depends on this contract:
//   bot.reply({ message, history }) -> Promise<{ text, suggestions: string[], handoff: boolean }>
// To plug in an LLM, add src/chatbot/llm-bot.js exporting a class with the same reply() method
// (call it with the same business facts via context.facts()), then select it with CHATBOT_PROVIDER=llm.
const { RuleBasedBot } = require('./rule-bot');

function createBot({ db, config }) {
  switch (config.chatbot.provider) {
    case 'rules':
      return new RuleBasedBot({ db, config });
    default:
      throw new Error(`Unknown CHATBOT_PROVIDER "${config.chatbot.provider}". Supported: rules (see docs/ARCHITECTURE.md to add an LLM).`);
  }
}

module.exports = { createBot };
