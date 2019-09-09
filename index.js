const TelegramBot = require('node-telegram-bot-api');
const API_TOKEN = process.env.TOKEN;
const telegram = new TelegramBot(API_TOKEN, { polling: true });

const {google} = require('googleapis');
const authentication = require("./authentication");

const sheets = google.sheets('v4');
const SHEET_ID = "1_tNYZINkyw9PItP4PXEulnmggCW6-NY98wKpIuUk3pY";

const PRESENT = 1;

telegram.on("text", (msg) => {
  if (msg.text == "/start") {
    sendMessage(msg, "yo");
  } else {
    authentication.authenticate().then((auth) => {
      sendMessage(msg, getData(auth));
    });
  }
});

function sendMessage(msg, text) {
  try {
    telegram.sendMessage(msg.chat.id, text);
  } catch (error) {
    console.log(error);
  }
}

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

function getData(auth) {
  sheets.spreadsheets.values.get({
    auth: auth,
    spreadsheetId: SHEET_ID,
    range: 'Results!O4',
  }, (err, response) => {
    if (err) {
      console.log("The API returned an error: ' + err");
      return;
    }
    let rows = response.values;
    if (rows.length === 0) {
      return 0;
    } else {
      let result = rows[0];
      return result;
    }
  });
}


function markAsPresent(msg) {
  sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "Results!O4",
    valueInputOption: "RAW",
    valuies: resource
  }, (err, result) => {
    if (err) {
      console.log(err);
    } else {
      telegram.sendMessage(msg.chat.id, "Attendance updated!");
    }
  });
}
