/**
 * CSCE 313 lab-time poll: vote store for CSCE-313/poll/index.html.
 *
 * Setup (once):
 *  1. Create a Google Sheet, then Extensions → Apps Script. Replace Code.gs with this file.
 *  2. Project Settings → Script properties → add RESET_CODE = <a passcode only you know>.
 *  3. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
 *  4. Copy the /exec URL into ENDPOINT in poll/index.html.
 *
 * After editing this file: Deploy → Manage deployments → Edit (pencil) → Version: New version
 * → Deploy. That keeps the same /exec URL.
 *
 * Rounds cycle 1 → 2 → 1. Each reset opens the next round and clears that round's
 * old votes, so the sheet always holds the latest two rounds.
 * Counts stay hidden until the instructor ends voting for the round.
 */

const SHEET_NAME = 'votes';
const OPTIONS = ['system-design', 'ml-systems', 'security', 'labs'];
const MAX_ROUNDS = 2;

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
  if (body.action === 'end') return json_(end_(body));
  if (body.action === 'reset') return json_(reset_(body));
  return json_({ error: 'bad_request' });
}

function isHost_(body) {
  const code = PropertiesService.getScriptProperties().getProperty('RESET_CODE');
  return !!code && String(body.passcode || '') === code;
}

function closed_() {
  return PropertiesService.getScriptProperties().getProperty('CLOSED') === 'true';
}

function vote_(body) {
  const voter = String(body.voter || '').slice(0, 64);
  const option = String(body.option || '');
  if (!voter || OPTIONS.indexOf(option) === -1) return { error: 'bad_request' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (closed_()) return { error: 'closed' };
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

function end_(body) {
  if (!isHost_(body)) return { error: 'wrong_passcode' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    PropertiesService.getScriptProperties().setProperty('CLOSED', 'true');
    return results_();
  } finally {
    lock.releaseLock();
  }
}

function reset_(body) {
  if (!isHost_(body)) return { error: 'wrong_passcode' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const next = round_() >= MAX_ROUNDS ? 1 : round_() + 1;
    // Rounds cycle 1..MAX_ROUNDS, so clear the votes left from the last time this round ran
    // (and any from rounds numbered past the cap).
    const sheet = sheet_();
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (rows[i][0] === next || rows[i][0] > MAX_ROUNDS) sheet.deleteRow(i + 1);
    }
    PropertiesService.getScriptProperties().setProperties({
      ROUND: String(next),
      SESSION: String(session_() + 1),
      CLOSED: 'false',
    });
    return results_();
  } finally {
    lock.releaseLock();
  }
}

// While voting is open only the vote total is public; counts appear once it ends.
function results_() {
  const round = round_();
  const open = !closed_();
  const counts = {};
  OPTIONS.forEach(function (o) { counts[o] = 0; });
  let total = 0;
  sheet_().getDataRange().getValues().slice(1).forEach(function (r) {
    if (r[0] === round && counts.hasOwnProperty(r[2])) {
      counts[r[2]]++;
      total++;
    }
  });
  const session = session_();
  return open
    ? { round: round, session: session, open: true, total: total }
    : { round: round, session: session, open: false, counts: counts, total: total };
}

function round_() {
  const n = Number(PropertiesService.getScriptProperties().getProperty('ROUND') || 1);
  return Math.min(Math.max(n, 1), MAX_ROUNDS);
}

// Counts every reset and never repeats, so browsers can tell a reused round number
// from the one they voted in.
function session_() {
  return Number(PropertiesService.getScriptProperties().getProperty('SESSION') || 1);
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
