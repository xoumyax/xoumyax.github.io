/**
 * CSCE 313 lab-time poll: vote store for CSCE-313/poll/index.html.
 *
 * Setup (once):
 *  1. Create a Google Sheet, then Extensions → Apps Script. Replace Code.gs with this file.
 *  2. Project Settings → Script properties → add RESET_CODE = <a passcode only you know>.
 *  3. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
 *  4. Copy the /exec URL into ENDPOINT in poll/index.html.
 *
 * Votes are never deleted. Each reset starts a new round, and results only count
 * the current round, so the sheet keeps a history of every session.
 */

const SHEET_NAME = 'votes';
const OPTIONS = ['system-design', 'ml-systems', 'security', 'labs'];

function doGet() {
  return json_(results_());
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ error: 'bad_request' });
  }
  if (body.action === 'vote') return json_(vote_(body));
  if (body.action === 'reset') return json_(reset_(body));
  return json_({ error: 'bad_request' });
}

function vote_(body) {
  const voter = String(body.voter || '').slice(0, 64);
  const option = String(body.option || '');
  if (!voter || OPTIONS.indexOf(option) === -1) return { error: 'bad_request' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const round = round_();
    const sheet = sheet_();
    const rows = sheet.getDataRange().getValues();
    // One vote per browser per round; voting again changes the vote.
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === round && rows[i][1] === voter) {
        sheet.getRange(i + 1, 3, 1, 2).setValues([[option, new Date()]]);
        return results_();
      }
    }
    sheet.appendRow([round, voter, option, new Date()]);
    return results_();
  } finally {
    lock.releaseLock();
  }
}

function reset_(body) {
  const code = PropertiesService.getScriptProperties().getProperty('RESET_CODE');
  if (!code || String(body.passcode || '') !== code) return { error: 'wrong_passcode' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    PropertiesService.getScriptProperties().setProperty('ROUND', String(round_() + 1));
    return results_();
  } finally {
    lock.releaseLock();
  }
}

function results_() {
  const round = round_();
  const counts = {};
  OPTIONS.forEach(function (o) { counts[o] = 0; });
  let total = 0;
  sheet_().getDataRange().getValues().slice(1).forEach(function (r) {
    if (r[0] === round && counts.hasOwnProperty(r[2])) {
      counts[r[2]]++;
      total++;
    }
  });
  return { round: round, counts: counts, total: total };
}

function round_() {
  return Number(PropertiesService.getScriptProperties().getProperty('ROUND') || 1);
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['round', 'voter', 'option', 'time']);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
