//Telegram
const TelegramBot = require('node-telegram-bot-api');
const API_TOKEN = process.env.TOKEN;
const telegram = new TelegramBot(API_TOKEN, { polling: true });

//JWT
const {JWT} = require('google-auth-library');
const key = require('./auth.json');
const scope = ['https://www.googleapis.com/auth/spreadsheets'];
const jwt = new JWT(key.client_email, null, key.private_key, scope);

//Google
const {google} = require('googleapis');
const sheets = google.sheets('v4');

//Google sheets
const SHEET_ID = "1_tNYZINkyw9PItP4PXEulnmggCW6-NY98wKpIuUk3pY";
const MATRIC_NUMBER = "CS2040 Lab3 Attendance!B4:B45";
const LAB_MAP = ["", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"]
const ATTENDANCE_COL = "CS2040 Lab3 Attendance!";
const TOKEN_LAB_RANGE = "CS2040 Lab3 Attendance!P4:Q4";
const PRESENT = "1";

telegram.on("text", (msg) => {
  if (msg.text == "/start" || msg.text == "/help") {
    sendWelcomeMessage(msg);
  } else {
    jwt.authorize((err, response) => {
      sheets.spreadsheets.values.get({
        auth: jwt,
        spreadsheetId: SHEET_ID,
        range: MATRIC_NUMBER,
      }, (err, result) => {
        if (err) {
          console.log('The API returned an error: ' + err);
          return;
        }
        const values = msg.text.split("/");
        if (values.length !== 4) {
          sendMessage(msg, "Wrong format! Type /help for more information.");
          return;
        }
        const module = values[0];
        const classNo = values[1];
        const studentNo = values[2];
        const inputToken = values[3];
        if (module.toUpperCase() !== "CS2040") {
          sendMessage(msg, "Course not found!");
          return;
        }
        if (classNo.toUpperCase() !== "LAB3") {
          sendMessage(msg, "Class not found!");
          return;
        }
        const matricNos = result.data.values.map(x => x[0]);
        sheets.spreadsheets.values.get({
          auth: jwt,
          spreadsheetId: SHEET_ID,
          range: TOKEN_LAB_RANGE,
        }, (err, result) => {
          const token = result.data.values[0][0];
          const lab = result.data.values[0][1];
          if (inputToken.toUpperCase() !== token) {
            sendMessage(msg, "No such token!");
            return;
          }
          const row = getRow(studentNo, matricNos);
          if (row === -1) {
            sendMessage(msg, "Student not found!");
            return;
          }
          sheets.spreadsheets.values.get({
            auth: jwt,
            spreadsheetId: SHEET_ID,
            range: ATTENDANCE_COL + LAB_MAP[lab] + row,
          }, (err, result) => {
            if (result.data.values !== undefined) {
              sendMessage(msg, "Attendance already marked!");
              return;
            }
            sheets.spreadsheets.values.update({
              auth: jwt,
              spreadsheetId: SHEET_ID,
              range: ATTENDANCE_COL + LAB_MAP[lab] + row,
              valueInputOption: "USER_ENTERED",
              resource: {
                values: [[PRESENT]]
              }
            }, (err, result) => {
              if (err) {
                console.log('The API returned an error: ' + err);
                return;
              }
              sendMessage(msg, "Attendance marked!");
            })
          });
        })
     })
    })
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
    let welcomeMessage = "Greetings from NUS Attendance Bot!\n";
    welcomeMessage += "Submit your attendance using the following format:\n\n";
    welcomeMessage += "MODULE_CODE/CLASS_NO/MATRIC_NO/TOKEN\n";
    welcomeMessage += "Eg: CS2040/LAB1/A0123456L/PEASOUP\n";
    telegram.sendMessage(msg.chat.id, welcomeMessage);
  } catch (error) {
    console.log(error);
  }
}

function getRow(no, matricNos) {
  for (let i = 0; i < matricNos.length; i++) {
    if (matricNos[i] === no) {
      return i + 4;
    }
  }
  return -1;
}
