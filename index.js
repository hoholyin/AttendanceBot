const TelegramBot = require('node-telegram-bot-api');
const API_TOKEN = process.env.TOKEN; 
const telegram = new TelegramBot(API_TOKEN, { polling: true });

const {google} = require('googleapis');
const fs = require('fs');
const readline = require('readline');
const promisify = require('es6-promisify');

const TOKEN_PATH = 'token.json';
const SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];
const sheets = google.sheets('v4');
const SHEET_ID = "1_tNYZINkyw9PItP4PXEulnmggCW6-NY98wKpIuUk3pY";

const PRESENT = 1;

let values = [[PRESENT]];
let resource = {
  values,
};

telegram.on("text", (msg) => {
  if (msg.text == "/start") {
    sendWelcomeMessage(msg);
  } else {
    markAsPresent(msg);
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
