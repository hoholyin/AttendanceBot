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
const SHEET_ID = "1_tNYZINkyw9PItP4PXEulnmggCW6-NY98wKpIuUk3pY";
const MATRIC_NUMBERS = "CS2040 Lab3 Attendance!B4:B"; 
const STUDENTS = "CS2040 Lab3 Attendance!A4:A"; 
const LAB_MAP = ["", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"]
const ATTENDANCE_COL = "CS2040 Lab3 Attendance!";
const TOKEN_LAB_RANGE = "CS2040 Lab3 Attendance!P4:Q4";

//Express
const http = require('http');
const express = require('express');
const app = express();

const PRESENT = "1";

//To keep telegram bot active
app.get("/", (request, response) => {
  console.log(Date.now() + " Ping Received");
  response.sendStatus(200);
});

app.listen(process.env.PORT);
setInterval(() => {
  http.get('http://hoholyin-attendancebot.glitch.me/');
}, 280000);

//Logic here
telegram.on("text", (msg) => {
  if (msg.text == "/start" || msg.text == "/help") {
    sendWelcomeMessage(msg);
  } else if (msg.text.split("/")[0] == "startclass") {
    const token = msg.text.split("/")[1];
    sheets.spreadsheets.values.batchGet({
      "auth": jwt,
      "spreadsheetId": SHEET_ID,
      "majorDimension": "COLUMNS",
      "ranges": [
        TOKEN_LAB_RANGE,
        "A4:A",
        "O4:O4"
      ]
    }, (err, result) => {
      const lab = result.data.valueRanges[0].values[1][0];
      const numberOfStudents = result.data.valueRanges[1].values[0].length;
      const started = result.data.valueRanges[2].values[0][0] == 'started';
      const initArray = new Array(numberOfStudents).fill(new Array(1).fill('-'));
      if (started) {
        sendMessage(msg, "Class already started!");
        return;
      }
      // start class, initialise everyone's field to be '-'
      initAttendance(msg, lab, initArray);
      // update classStarted to true on spreadsheet
      setClassTo(msg, 'started');
      // update Token on spreadsheet
      updateToken(msg, token);
      return;
    })
  } else if (msg.text == "close") {
    sheets.spreadsheets.values.batchGet({
      auth: jwt,
      spreadsheetId: SHEET_ID,
      ranges: [
        "O4:O4",
        TOKEN_LAB_RANGE
      ] 
    }, (err, result) => {
      const ongoing = result.data.valueRanges[0].values[0][0] == 'started';
      const lab = result.data.valueRanges[1].values[0][1];
      if (!ongoing) {
        sendMessage(msg, "No class ongoing.");
        return;
      }
      finaliseAttendance(msg, lab);
      setClassTo(msg, 'closed');
    })
  } else if (msg.text == "/check") {
    sheets.spreadsheets.values.batchGet({
      auth: jwt,
      spreadsheetId: SHEET_ID,
      ranges: [
        "O4:O4",
        TOKEN_LAB_RANGE
      ] 
    }, (err, result) => {
      const ongoing = result.data.valueRanges[0].values[0][0] == 'started';
      const lab = result.data.valueRanges[1].values[0][1];
      if (!ongoing) {
        sendMessage(msg, "No class ongoing.");
        return;
      }
      showAbsentees(msg, lab);
    })
  } else {
    jwt.authorize((err, response) => {
      const started = checkIfClassStarted();
      if (!started) {
        sendMessage(msg, "The class has not started yet.");
        return;
      }
      sheets.spreadsheets.values.get({
        auth: jwt,
        spreadsheetId: SHEET_ID,
        range: MATRIC_NUMBERS,
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
        const row = getRow(studentNo, matricNos);
        if (row === -1) {
          sendMessage(msg, "Student not found!");
          return;
        }
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
          sheets.spreadsheets.values.get({
            auth: jwt,
            spreadsheetId: SHEET_ID,
            range: ATTENDANCE_COL + "A" + row + ":" + LAB_MAP[lab] + row,
          }, (err, result) => {
            if (result.data.values == undefined) {
              console.log(studentNo);
              sendMessage(msg, "Something went wrong :(");
              return;
            }
            const name = result.data.values[0][0];
            if (result.data.values[0][result.data.values[0].length - 1] == 1) {
              sendMessage(msg, "Attendance already marked for " + name + "!");
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
              sendMessage(msg, "Attendance marked for " + name + "!");
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
    let welcomeMessage = "Greetings from AttendanceBot!\n";
    welcomeMessage += "Submit your attendance using the following format:\n\n";
    welcomeMessage += "MODULE_CODE/LAB_GROUP/MATRIC_NO/TOKEN\n";
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

function initAttendance(msg, lab, initArray) {
  sheets.spreadsheets.values.update({
    "auth": jwt,
    "spreadsheetId": SHEET_ID,
    "range": [
      ATTENDANCE_COL + LAB_MAP[lab] + "4:" + LAB_MAP[lab]
    ],
    "valueInputOption": 'USER_ENTERED',
    "resource": {
      "values": initArray
    }
  }, (err, result) => {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    sendMessage(msg, "Initialised attendance sheet.");
  })
}

function setClassTo(msg, state) {
  sheets.spreadsheets.values.update({
    "auth": jwt,
    "spreadsheetId": SHEET_ID,
    "range": [
      ATTENDANCE_COL + "O4:O4"
    ],
    "valueInputOption": 'USER_ENTERED',
    "resource": {
      "values": [[state]]
    }
  }, (err, result) => {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    sendMessage(msg, "Class status: " + state);
  })
}

function updateToken(msg, token) {
    sheets.spreadsheets.values.update({
    "auth": jwt,
    "spreadsheetId": SHEET_ID,
    "range": [
      ATTENDANCE_COL + "P4:P4"
    ],
    "valueInputOption": 'USER_ENTERED',
    "resource": {
      "values": [[token.toUpperCase()]]
    }
  }, (err, result) => {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    sendMessage(msg, "Token set as: " + token);
  })
}

function finaliseAttendance(msg, lab) {
  sheets.spreadsheets.values.get({
    auth: jwt,
    spreadsheetId: SHEET_ID,
    range: ATTENDANCE_COL + LAB_MAP[lab] + "4:" + LAB_MAP[lab],
  }, (err, result) => {
    let attendanceSheet = result.data.values;
    let finalised = attendanceSheet.map(x => x[0] == '-' ? new Array(1).fill(0) : x);
    sheets.spreadsheets.values.update({
      "auth": jwt,
      "spreadsheetId": SHEET_ID,
      "range": [
        ATTENDANCE_COL + LAB_MAP[lab] + "4:" + LAB_MAP[lab]
      ],
      "valueInputOption": 'USER_ENTERED',
      "resource": {
        "values": finalised
      }
    }, (err, result) => {
      if (err) {
        console.log('The API returned an error: ' + err);
        return;
      }
      sendMessage(msg, "Finalised attendance sheet for lab session " + lab + ".");
    })
  })
}

function checkIfClassStarted() {
  sheets.spreadsheets.values.get({
      auth: jwt,
      spreadsheetId: SHEET_ID,
      range: "O4:O4",
  }, (err, result) => {
    const ongoing = result.data.values[0][0] == 'started';
    if (!ongoing) {
      return false;
    }
  })
}

function showAbsentees(msg, lab) {
  sheets.spreadsheets.values.batchGet({
    auth: jwt,
    spreadsheetId: SHEET_ID,
    ranges: [
      ATTENDANCE_COL + LAB_MAP[lab] + "4:" + LAB_MAP[lab],
      STUDENTS,
    ]
  }, (err, result) => {
    const attendanceSheet = result.data.valueRanges[0].values;
    const students = result.data.valueRanges[1].values;
    let names = "Here are the list of people who have yet to take attendance: \n\n";
    for (let i = 0; i < attendanceSheet.length; i++) {
      if (attendanceSheet[i] == '-') {
        names += students[i] + '\n';
      }
    }
    sendMessage(msg, names);
  })
}
