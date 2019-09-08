var TelegramBot = require('node-telegram-bot-api');
const API_TOKEN = process.env.TOKEN; 
const telegram = new TelegramBot(API_TOKEN, { polling: true });

telegram.on("text", (msg) => {
  if (msg.text == "/start") {
    sendWelcomeMessage(msg);
  } else {
    telegram.sendMessage(msg.chat.id, "You said: " + msg.text);
  }
});

function sendWelcomeMessage(msg) {
  try {
    let welcomeMessage = "Greetings from NUS Attendance Bot!\n\n";
    welcomeMessage += "Submit your attendance using the following format:\n\n";
    welcomeMessage += "MODULE_CODE/MATRIC_NO/TOKEN\n\n";
    welcomeMessage += "Eg: CS2040/A0123456L/PEASOUP\n";
    telegram.sendMessage(msg.chat.id, welcomeMessage);
  } catch (error) {
    console.log(error);
  }
}
