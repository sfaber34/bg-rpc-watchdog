const TelegramBot = require("node-telegram-bot-api");

require("dotenv").config();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS
  ? process.env.TELEGRAM_CHAT_IDS.split(",").map((id) => id.trim())
  : [];
const telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

function sendTelegramAlert(message, errorCode) {
  TELEGRAM_CHAT_IDS.forEach((chatId) => {
    telegramBot
      .sendMessage(chatId, message)
      .then(() => console.log(`Telegram alert sent to ${chatId}!`))
      .catch((err) =>
        console.error(`Telegram alert error for ${chatId}:`, err)
      );
  });
}

module.exports = {
  sendTelegramAlert
}; 