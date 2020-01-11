//Telegram
const TelegramBot = require('node-telegram-bot-api');
const API_TOKEN = process.env.TOKEN;
const telegram = new TelegramBot(API_TOKEN, { polling: true });
const PASSWORD = process.env.PASSWORD;

//JWT
const {JWT} = require('google-auth-library');
const key = require('./auth.json');
const scope = ['https://www.googleapis.com/auth/spreadsheets'];
const jwt = new JWT(key.client_email, null, key.private_key, scope);

//Google
const {google} = require('googleapis');
const sheets = google.sheets('v4');
const SHEET_ID = "1_tNYZINkyw9PItP4PXEulnmggCW6-NY98wKpIuUk3pY";
const MATRIC_NUMBERS = "CS2040 Lab Attendance!B4:B";
const LAB_MAP = ["", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"]
const ATTENDANCE_COL = "CS2040 Lab Attendance!";
const TOKEN_LAB_RANGE = "CS2040 Lab Attendance!P4:Q4";
const NAME_RANGE = "CS2040 Lab Attendance!A4:A";
const CLASS_STATUS_RANGE = "CS2040 Lab Attendance!O4:O4";

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
  } else if (msg.text.split("/")[0] == "start") {
    const inputPassword = msg.text.split("/")[3];
    const inputClassNo = msg.text.split("/")[1];
    if (inputPassword != PASSWORD) {
      sendMessage(msg, "Unauthorised action.");
      return;
    }
    if (!isValidClassNo(inputClassNo)) {
      sendMessage(msg, "Invalid class number.");
      return;
    }
    const token = msg.text.split("/")[2];
    sheets.spreadsheets.values.batchGet({
      "auth": jwt,
      "spreadsheetId": SHEET_ID,
      "majorDimension": "COLUMNS",
      "ranges": [
        specifyLab(TOKEN_LAB_RANGE, inputClassNo),
        specifyLab(NAME_RANGE, inputClassNo),
        specifyLab(CLASS_STATUS_RANGE, inputClassNo)
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
      initAttendance(msg, lab, initArray, inputClassNo);
      // update classStarted to true on spreadsheet
      setClassTo(msg, 'started', inputClassNo);
      // update Token on spreadsheet
      updateToken(msg, token, inputClassNo);
      return;
    })
  } else if (msg.text.split("/")[0] == "close") {
    const inputClassNo = msg.text.split("/")[1];
    const inputPassword = msg.text.split("/")[2];

    if (inputPassword != PASSWORD) {
      sendMessage(msg, "Unauthorised action.");
      return;
    }
    if (!isValidClassNo(inputClassNo)) {
      sendMessage(msg, "Invalid class number.");
      return;
    }

    sheets.spreadsheets.values.batchGet({
      auth: jwt,
      spreadsheetId: SHEET_ID,
      ranges: [
        specifyLab(CLASS_STATUS_RANGE, inputClassNo),
        specifyLab(TOKEN_LAB_RANGE, inputClassNo)
      ] 
    }, (err, result) => {
      const ongoing = result.data.valueRanges[0].values[0][0] == 'started';
      const lab = result.data.valueRanges[1].values[0][1];
      if (!ongoing) {
        sendMessage(msg, "No class ongoing.");
        return;
      }
      finaliseAttendance(msg, lab, inputClassNo);
      setClassTo(msg, 'closed', inputClassNo);
    })
  } else if (msg.text.split("/")[0] == "check") {
    const inputClassNo = msg.text.split("/")[1]
    if (!isValidClassNo(inputClassNo)) {
      sendMessage(msg, "Invalid class number.");
      return;
    }
    sheets.spreadsheets.values.batchGet({
      auth: jwt,
      spreadsheetId: SHEET_ID,
      ranges: [
        specifyLab(CLASS_STATUS_RANGE, inputClassNo),
        specifyLab(TOKEN_LAB_RANGE, inputClassNo)
      ] 
    }, (err, result) => {
      const ongoing = result.data.valueRanges[0].values[0][0] == 'started';
      const lab = result.data.valueRanges[1].values[0][1];
      if (!ongoing) {
        sendMessage(msg, "No class ongoing.");
        return;
      }
      showAbsentees(msg, lab, inputClassNo);
    })
  } else {
    const values = msg.text.split("/");
    if (values.length !== 4) {
      sendMessage(msg, "Wrong format! Type /help for more information.");
      return;
    }
    const module = values[0];
    const inputClassNo = values[1].substr(-1);
    const studentNo = values[2];
    const inputToken = values[3];
    if (module.toUpperCase() !== "CS2040") {
      sendMessage(msg, "Course not found!");
      return;
    }
    if (!isValidClassNo(inputClassNo)) {
      sendMessage(msg, "Class not found!");
      return;
    }
    jwt.authorize((err, response) => {
      sheets.spreadsheets.values.batchGet({
        auth: jwt,
        spreadsheetId: SHEET_ID,
        ranges: [
          specifyLab(CLASS_STATUS_RANGE, inputClassNo),
          specifyLab(MATRIC_NUMBERS, inputClassNo)
        ]
      }, (err, result) => {
        if (err) {
          console.log('The API returned an error: ' + err);
          return;
        }
        const ongoing = result.data.valueRanges[0].values[0][0] == 'started';
        const matricNos = result.data.valueRanges[1].values.map(x => x[0]);
        const row = getRow(studentNo, matricNos);
        if (!ongoing) {
          sendMessage(msg, "No class ongoing.");
          return;
        }
        if (row === -1) {
          sendMessage(msg, "Student not found!");
          return;
        }
        sheets.spreadsheets.values.get({
          auth: jwt,
          spreadsheetId: SHEET_ID,
          range: specifyLab(TOKEN_LAB_RANGE, inputClassNo),
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
            range: specifyLab(ATTENDANCE_COL, inputClassNo) + "A" + row + ":" + LAB_MAP[lab] + row,
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
              range: specifyLab(ATTENDANCE_COL, inputClassNo) + LAB_MAP[lab] + row,
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

function initAttendance(msg, lab, initArray, classNo) {
  sheets.spreadsheets.values.update({
    "auth": jwt,
    "spreadsheetId": SHEET_ID,
    "range": [
      specifyLab(ATTENDANCE_COL, classNo) + LAB_MAP[lab] + "4:" + LAB_MAP[lab]
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

function setClassTo(msg, state, classNo) {
  sheets.spreadsheets.values.update({
    "auth": jwt,
    "spreadsheetId": SHEET_ID,
    "range": [
      specifyLab(CLASS_STATUS_RANGE, classNo)
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

function updateToken(msg, token, classNo) {
    sheets.spreadsheets.values.update({
    "auth": jwt,
    "spreadsheetId": SHEET_ID,
    "range": [
      specifyLab(ATTENDANCE_COL, classNo) + "P4:P4"
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
    sendMessage(msg, "Token set as: " + token.toUpperCase());
  })
}

function finaliseAttendance(msg, lab, classNo) {
  sheets.spreadsheets.values.get({
    auth: jwt,
    spreadsheetId: SHEET_ID,
    range: specifyLab(ATTENDANCE_COL, classNo) + LAB_MAP[lab] + "4:" + LAB_MAP[lab],
  }, (err, result) => {
    let attendanceSheet = result.data.values;
    let finalised = attendanceSheet.map(x => x[0] == '-' ? new Array(1).fill(0) : x);
    sheets.spreadsheets.values.update({
      "auth": jwt,
      "spreadsheetId": SHEET_ID,
      "range": [
        specifyLab(ATTENDANCE_COL, classNo) + LAB_MAP[lab] + "4:" + LAB_MAP[lab]
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

function checkIfClassStarted(classNo) {
  sheets.spreadsheets.values.get({
      auth: jwt,
      spreadsheetId: SHEET_ID,
      range: specifyLab(CLASS_STATUS_RANGE, classNo) + "O4:O4",
  }, (err, result) => {
    const ongoing = result.data.values[0][0] == 'started';
    return ongoing;
  })
}

function showAbsentees(msg, lab, classNo) {
  sheets.spreadsheets.values.batchGet({
    auth: jwt,
    spreadsheetId: SHEET_ID,
    ranges: [
      specifyLab(ATTENDANCE_COL, classNo) + LAB_MAP[lab] + "4:" + LAB_MAP[lab],
      specifyLab(NAME_RANGE, classNo),
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

function specifyLab(str, labNo) {
  return str.replace("Lab", "Lab" + labNo)
}


function isValidClassNo(classNo) {
  return classNo == "1" || classNo == "8"
}
