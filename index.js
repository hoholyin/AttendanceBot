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
const MATRIC_NUMBERS = "Attendance!B4:B";
const SESSION_MAP = ["", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];
const ATTENDANCE_COL = "Attendance!";
const TOKEN_LAB_RANGE = "Attendance!P4:Q4";
const NAME_RANGE = "Attendance!A4:A";
const CLASS_STATUS_RANGE = "Attendance!O4:O4";
const TOKEN_RANGE = "Attendance!Q4:Q4";
const validCourses = new Set().add("CS2040").add("CS1231S");

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
  if (shouldDisplayAssistiveMessage(msg)) {
    // Welcome and help message
    sendWelcomeMessage(msg);
  } else if (shouldStartClass(msg)) {
    // Start class action
    // Format: start/CS2040/Lab9/token/password
    const moduleCode = msg.text.split("/")[1].toUpperCase();
    const inputClassNo = msg.text.split("/")[2].toUpperCase();
    const token = msg.text.split("/")[3].toUpperCase();
    const inputPassword = msg.text.split("/")[4].toUpperCase();
    if (inputPassword != PASSWORD) {
      sendMessage(msg, "Unauthorised action.");
      return;
    }
    if (!isValidClassNo(inputClassNo)) {
      sendMessage(msg, "Invalid class number.");
      return;
    }

    adminStartClass(msg, moduleCode, inputClassNo, inputPassword, token);
  } else if (shouldEndClass(msg)) {
    // End class action
    // Format: close/CS2040/LAB9/password
    // Format: close/CS1231S/TUT3/password
    const moduleCode = msg.text.split("/")[1].toUpperCase();
    const inputClassNo = msg.text.split("/")[2].toUpperCase();
    const inputPassword = msg.text.split("/")[3].toUpperCase();
    if (inputPassword != PASSWORD) {
      sendMessage(msg, "Unauthorised action.");
      return;
    }
    if (!isValidClassNo(inputClassNo)) {
      sendMessage(msg, "Invalid class number.");
      return;
    }

    adminEndClass(msg, moduleCode, inputClassNo, inputPassword);
  } else if (shouldCheckClass(msg)) {
    // Check class status action
    // Format: check/CS2040/LAB9
    // Format: check/CS1231S/TUT3
    const moduleCode = msg.text.split("/")[1].toUpperCase();
    const inputClassNo = msg.text.split("/")[2].toUpperCase();
    if (!isValidClassNo(inputClassNo)) {
      sendMessage(msg, "Invalid class number.");
      return;
    }

    adminCheckClass(msg, moduleCode, inputClassNo);
  } else if (shouldMarkAttendance(msg)) {
    // Mark attendance action
    // Format: CS2040/LAB9/student-matric-number/token
    // Format: CS1231S/TUT3/student-matric-number/token
    const values = msg.text.split("/");
    if (values.length !== 4) {
      sendMessage(msg, "Wrong format! Type /help for more information.");
      return;
    }
    const moduleCode = values[0].toUpperCase();
    const inputClassNo = values[1].toUpperCase();
    const studentNo = values[2].toUpperCase();
    const inputToken = values[3].toUpperCase();
    if (!validCourses.has(moduleCode.toUpperCase())) {
      console.log(validCourses.has(moduleCode));
      console.log(validCourses);
      sendMessage(msg, "Course not found!");
      return;
    }
    if (!isValidClassNo(inputClassNo)) {
      sendMessage(msg, "Class not found!");
      return;
    }

    markAttendance(msg, moduleCode, inputClassNo, studentNo, inputToken);
  } else {
    sendMessage(msg, "Wrong format");
  }
});

function shouldDisplayAssistiveMessage(msg) {
    return msg.text.match(/^\/(start|help)/);
}

function shouldStartClass(msg) {
    return msg.text.match(/^start\//);
}

function shouldEndClass(msg) {
    return msg.text.match(/^close\//);
}

function shouldCheckClass(msg) {
    return msg.text.match(/^check\/\w{2}\d{4}\w?\/\w{3}\d{1,2}$/);
}

function shouldMarkAttendance(msg) {
    // Module code regex = \w{2}\d{4}\w?\/
    // Class no regex = \w{3}\d\/
    // student number regex = A\\d{7}\w\/
    // token = \w+
    const responseRegex = new RegExp()
    return msg.text.match(/^(\w{2}\d{4}\w?\/\w{3}\d\/A\d{7}\w\/\w+)$/);
}

function markAttendance(msg, moduleCode, classNo, studentNo, inputToken) {
    jwt.authorize((err, response) => {
      sheets.spreadsheets.values.batchGet({
        auth: jwt,
        spreadsheetId: SHEET_ID,
        ranges: [
          formatRange(CLASS_STATUS_RANGE, moduleCode, classNo),
          formatRange(MATRIC_NUMBERS, moduleCode, classNo),
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
        verifyTokenAndUpdateAttendance(msg, moduleCode, classNo, row, inputToken);
     })
  })
}

function verifyTokenAndUpdateAttendance(msg, moduleCode, classNo, row, inputToken) {
  sheets.spreadsheets.values.get({
    auth: jwt,
    spreadsheetId: SHEET_ID,
    range: formatRange(TOKEN_LAB_RANGE, moduleCode, classNo),
  }, (err, result) => {
    const token = result.data.values[0][0];
    const session = result.data.values[0][1];
    if (inputToken.toUpperCase() !== token) {
      sendMessage(msg, "No such token!");
      return;
    }
    checkAndUpdateAttendance(msg, moduleCode, classNo, session, row);
  })
}

function checkAndUpdateAttendance(msg, moduleCode, classNo, session, row) {
  sheets.spreadsheets.values.get({
    auth: jwt,
    spreadsheetId: SHEET_ID,
    range: formatRange(ATTENDANCE_COL, moduleCode, classNo) + "A" + row + ":" + SESSION_MAP[session] + row,
  }, (err, result) => {
    if (result.data.values == undefined) {
      sendMessage(msg, "Something went wrong :(");
      return;
    }
    const name = result.data.values[0][0];
    if (result.data.values[0][result.data.values[0].length - 1] == 1) {
      sendMessage(msg, "Attendance already marked for " + name + "!");
      return;
    }
    updateAttendance(msg, moduleCode, classNo, session, row, name);
  });
}

function updateAttendance(msg, moduleCode, classNo, session, row, name) {
  sheets.spreadsheets.values.update({
    auth: jwt,
    spreadsheetId: SHEET_ID,
    range: formatRange(ATTENDANCE_COL, moduleCode, classNo) + SESSION_MAP[session] + row,
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
}

function adminStartClass(msg, moduleCode, inputClassNo, inputPassword, token) {
    sheets.spreadsheets.values.batchGet({
      "auth": jwt,
      "spreadsheetId": SHEET_ID,
      "majorDimension": "COLUMNS",
      "ranges": [
        formatRange(TOKEN_LAB_RANGE, moduleCode, inputClassNo),
        formatRange(NAME_RANGE, moduleCode, inputClassNo),
        formatRange(CLASS_STATUS_RANGE, moduleCode, inputClassNo),
      ]
    }, (err, result) => {
      const isStarted = result.data.valueRanges[2].values[0][0] == 'started';
      if (isStarted) {
        sendMessage(msg, "Class already started!");
        return;
      }
      const session = result.data.valueRanges[0].values[1][0];
      const numberOfStudents = result.data.valueRanges[1].values[0].length;
      const initArray = new Array(numberOfStudents).fill(new Array(1).fill('-'));
      // start class, initialise everyone's field to be '-'
      initAttendance(msg, moduleCode, session, initArray, inputClassNo);
      // update classStarted to true on spreadsheet
      setClassTo(msg, moduleCode, 'started', inputClassNo);
      // update Token on spreadsheet
      updateToken(msg, moduleCode, token, inputClassNo);
      return;
    })
}

function adminEndClass(msg, moduleCode, classNo, password) {
    sheets.spreadsheets.values.batchGet({
      auth: jwt,
      spreadsheetId: SHEET_ID,
      ranges: [
        formatRange(CLASS_STATUS_RANGE, moduleCode, classNo),
        formatRange(TOKEN_LAB_RANGE, moduleCode, classNo),
      ] 
    }, (err, result) => {
      const isStarted = result.data.valueRanges[0].values[0][0] == 'started';
      if (!isStarted) {
        sendMessage(msg, "No class ongoing.");
        return;
      }
      const lab = result.data.valueRanges[1].values[0][1];
      finaliseAttendance(msg, moduleCode, lab, classNo);
      setClassTo(msg, moduleCode, 'closed', classNo);
      bumpSession(msg, moduleCode, classNo);
    })
}

function adminCheckClass(msg, moduleCode, classNo) {
    sheets.spreadsheets.values.batchGet({
      auth: jwt,
      spreadsheetId: SHEET_ID,
      ranges: [
        formatRange(CLASS_STATUS_RANGE, moduleCode, classNo),
        formatRange(TOKEN_LAB_RANGE, moduleCode, classNo),
      ] 
    }, (err, result) => {
      const ongoing = result.data.valueRanges[0].values[0][0] == 'started';
      const lab = result.data.valueRanges[1].values[0][1];
      if (!ongoing) {
        sendMessage(msg, "No class ongoing.");
        return;
      }
      showAbsentees(msg, moduleCode, lab, classNo);
    })
}

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

function initAttendance(msg, moduleCode, session, initArray, classNo) {
  sheets.spreadsheets.values.update({
    "auth": jwt,
    "spreadsheetId": SHEET_ID,
    "range": [
      formatRange(ATTENDANCE_COL, moduleCode, classNo) + SESSION_MAP[session] + "4:" + SESSION_MAP[session]
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
    sendMessage(msg, "Initialised attendance sheet for session " + session + ".");
  })
}

function setClassTo(msg, moduleCode, state, classNo) {
  sheets.spreadsheets.values.update({
    "auth": jwt,
    "spreadsheetId": SHEET_ID,
    "range": [
      formatRange(CLASS_STATUS_RANGE, moduleCode, classNo)
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

function updateToken(msg, moduleCode, token, classNo) {
    sheets.spreadsheets.values.update({
    "auth": jwt,
    "spreadsheetId": SHEET_ID,
    "range": [
      formatRange(ATTENDANCE_COL, moduleCode, classNo) + "P4:P4"
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

function finaliseAttendance(msg, moduleCode, session, classNo) {
  sheets.spreadsheets.values.get({
    auth: jwt,
    spreadsheetId: SHEET_ID,
    range: formatRange(ATTENDANCE_COL, moduleCode, classNo) + SESSION_MAP[session] + "4:" + SESSION_MAP[session],
  }, (err, result) => {
    let attendanceSheet = result.data.values;
    let finalised = attendanceSheet.map(x => x[0] == '-' ? new Array(1).fill(0) : x);
    sheets.spreadsheets.values.update({
      "auth": jwt,
      "spreadsheetId": SHEET_ID,
      "range": [
        formatRange(ATTENDANCE_COL, moduleCode, classNo) + SESSION_MAP[session] + "4:" + SESSION_MAP[session]
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
      sendMessage(msg, "Finalised attendance sheet for session " + session + ".");
    })
  })
}

function bumpSession(msg, moduleCode, classNo) {
  sheets.spreadsheets.values.get({
    auth: jwt,
    spreadsheetId: SHEET_ID,
    range: formatRange(TOKEN_RANGE, moduleCode, classNo),
  }, (err, result) => {
    const session = result.data.values[0];
    const nextSession = parseInt(session) + 1;
    sheets.spreadsheets.values.update({
      "auth": jwt,
      "spreadsheetId": SHEET_ID,
      "range": [
        formatRange(TOKEN_RANGE, moduleCode, classNo)
      ],
      "valueInputOption": 'USER_ENTERED',
      "resource": {
        "values": [[nextSession]]
      }
    }, (err, result) => {
      if (err) {
        console.log('The API returned an error: ' + err);
        return;
      }
      sendMessage(msg, "Session bumped to: " + nextSession);
    })
  })
}

function checkIfClassStarted(classNo, moduleCode) {
  sheets.spreadsheets.values.get({
      auth: jwt,
      spreadsheetId: SHEET_ID,
      range: formatRange(CLASS_STATUS_RANGE, moduleCode, classNo) + "O4:O4",
  }, (err, result) => {
    const ongoing = result.data.values[0][0] == 'started';
    return ongoing;
  })
}

function showAbsentees(msg, moduleCode, session, classNo) {
  sheets.spreadsheets.values.batchGet({
    auth: jwt,
    spreadsheetId: SHEET_ID,
    ranges: [
      formatRange(ATTENDANCE_COL, moduleCode, classNo) + SESSION_MAP[session] + "4:" + SESSION_MAP[session],
      formatRange(NAME_RANGE, moduleCode, classNo),
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

function isValidClassNo(classNo) {
  return classNo.match(/[1239]/);
}

function extractNumber(classNo) {
  return classNo.substr(-1);
}

function formatRange(range, moduleCode, classNo) {
  const classType = classNo.substring(0, classNo.length - 1);
  const formattedClassType = classType.charAt(0).toUpperCase() + classType.slice(1).toLowerCase();
  const classNum = classNo.substr(-1);
  return moduleCode + " " + formattedClassType + classNum + " " + range;
}

