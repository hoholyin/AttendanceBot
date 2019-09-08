var TelegramBot = require('node-telegram-bot-api');
const API_TOKEN = process.env.TOKEN 
telegram = new TelegramBot(API_TOKEN, { polling: true });

telegram.on("text", (msg) => {
  if (msg.text == "/start") {
    sendWelcomeMessage(msg);
  } else {
    telegram.sendMessage(msg.chat.id, "You said: " + msg.text);
  }
});

function sendWelcomeMessage(msg) {
  let welcomeMessage = "Greetings from NUS Attendance Bot!\n";
  welcomeMessage += "Submit your attendance using the following format:\n";
  welcomeMessage += "MODULE_CODE/MATRIC_NO/TOKEN";
  telegram.sendMessage(msg.chat.id, welcomeMessage);
}
