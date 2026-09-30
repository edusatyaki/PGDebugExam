/**
 * =====================================================================
 * PostgreSQL Debugging Test — Google Apps Script backend
 * ---------------------------------------------------------------------
 * Stores, per attempt: name, section, enrolment number, network address,
 * live progress, final score, and proctoring counts — Malpractice (TRUE /
 * FALSE), screen exits, resizes, Inspect attempts and scripted clicks.
 * A student may sit the test any number of times; each attempt is a row.
 *
 * Three sheets are maintained:
 *   Responses — one row per completed attempt (the gradebook)
 *   Live      — one row per attempt, upserted as the student works, so an
 *               abandoned round still shows how far they got
 *   Answers   — one row per question per attempt (set DETAIL_NAME = '' to skip)
 *
 * SETUP
 *   1. Open the Google Sheet that should store the results.
 *   2. Extensions → Apps Script. Delete anything there, paste this file.
 *   3. Run  setup()  once and approve the permission prompt.
 *   4. Deploy → New deployment → type "Web app"
 *        Execute as:        Me
 *        Who has access:    Anyone
 *   5. Copy the /exec URL into js/config.js → APPS_SCRIPT_URL.
 *
 * NOTE ON RE-DEPLOYS: after editing this file you must run
 * Deploy → Manage deployments → edit → Version: New version → Deploy,
 * otherwise the live URL keeps serving the old code.
 * =====================================================================
 */

var SHEET_NAME  = 'Responses';
var LIVE_NAME   = 'Live';
var DETAIL_NAME = 'Answers';        // per-question detail; set to '' to skip
var LEADERBOARD_LIMIT = 10;

var HEADERS = [
  'Timestamp', 'Attempt ID', 'Name', 'Section', 'Enrolment No', 'IP Address',
  'Score', 'Total Questions', 'Answered', 'Correct', 'Wrong', 'Timed Out',
  'Accuracy %', 'Best Streak', 'Left Page', 'Time Taken (s)', 'Avg per Q (s)',
  'Topic Breakdown', 'Client Time', 'User Agent',
  'Malpractice', 'Violations', 'Screen Exits', 'Resizes', 'Inspect Attempts',
  'Automated Clicks', 'Malpractice Reason', 'Screen on Entry'
];

var LIVE_HEADERS = [
  'Attempt ID', 'Last Update', 'Name', 'Section', 'Enrolment No', 'IP Address',
  'Status', 'Answered', 'Total', 'Progress %', 'Correct', 'Wrong', 'Timed Out',
  'Score', 'Left Page', 'Elapsed (s)', 'Malpractice', 'Violations', 'Screen Exits',
  'Resizes', 'Inspect Attempts', 'Automated Clicks'
];

var DETAIL_HEADERS = [
  'Timestamp', 'Attempt ID', 'Name', 'Section', 'Enrolment No',
  'Q #', 'Topic', 'Answer Given', 'Correct?', 'Seconds'
];

/* --------------------------------------------------------------------- */
/* Run this once from the editor.                                        */
/* --------------------------------------------------------------------- */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  initSheet(ss, SHEET_NAME, HEADERS);
  initSheet(ss, LIVE_NAME, LIVE_HEADERS);
  if (DETAIL_NAME) initSheet(ss, DETAIL_NAME, DETAIL_HEADERS);

  return 'Setup complete on "' + ss.getName() + '"';
}

function initSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  // Rewriting the header row adds columns introduced by later versions.
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  else sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold').setBackground('#0d1220').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  return sheet;
}

/* --------------------------------------------------------------------- */
/* POST — save a completed result, or upsert a live progress checkpoint   */
/* --------------------------------------------------------------------- */
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else if (e && e.parameter && e.parameter.payload) {
      body = JSON.parse(e.parameter.payload);   // form-encoded fallback
    }
    if (!body || !body.name) return json({ ok: false, error: 'Missing name' });

    return (body.action === 'progress') ? saveProgress(body) : saveResult(body);

  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/* ------------------------- completed attempt ------------------------- */
function saveResult(body) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME) || initSheet(ss, SHEET_NAME, HEADERS);

    sheet.appendRow([
      new Date(),
      body.attemptId || '',
      body.name || '',
      body.section || '',
      body.enrolment || '',
      body.ip || '',
      num(body.score), num(body.total), num(body.answered), num(body.correct),
      num(body.wrong), num(body.skipped), num(body.accuracy), num(body.bestStreak),
      num(body.leftPageCount), num(body.timeTakenSec), num(body.avgSecPerQ),
      body.topicBreakdown || '',
      body.clientTime || '',
      body.userAgent || '',
      body.malpractice === true,
      num(body.violations), num(body.screenExits), num(body.resizes),
      num(body.inspectAttempts), num(body.automatedClicks),
      body.malpracticeReason || '',
      body.screenBaseline || ''
    ]);

    if (DETAIL_NAME && body.answers && body.answers.length) {
      var d = ss.getSheetByName(DETAIL_NAME);
      if (d) {
        var stamp = new Date();
        var rows = body.answers.map(function (a) {
          return [stamp, body.attemptId || '', body.name, body.section || '',
                  body.enrolment || '', a.n, a.t, a.picked, a.ok ? 'YES' : 'NO', a.s];
        });
        d.getRange(d.getLastRow() + 1, 1, rows.length, DETAIL_HEADERS.length).setValues(rows);
      }
    }

    return json({ ok: true, saved: true, row: sheet.getLastRow() });

  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* --------------------- live progress checkpoint ---------------------- */
/* One row per attempt, matched on Attempt ID and overwritten in place.  */
function saveProgress(body) {
  var lock = LockService.getScriptLock();
  try {
    // A short wait on purpose: checkpoints carry the latest state, so a
    // missed one is harmless — the next checkpoint supersedes it.
    if (!lock.tryLock(8000)) return json({ ok: false, error: 'busy' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(LIVE_NAME) || initSheet(ss, LIVE_NAME, LIVE_HEADERS);
    var id = body.attemptId || '';
    if (!id) return json({ ok: false, error: 'Missing attemptId' });

    var row = [
      id, new Date(), body.name || '', body.section || '', body.enrolment || '',
      body.ip || '', body.status || 'in-progress',
      num(body.answered), num(body.total), num(body.progressPct),
      num(body.correct), num(body.wrong), num(body.skipped),
      num(body.score), num(body.leftPageCount), num(body.elapsedSec),
      body.malpractice === true,
      num(body.violations), num(body.screenExits), num(body.resizes),
      num(body.inspectAttempts), num(body.automatedClicks)
    ];

    var target = findRowByAttemptId(sheet, id);

    // Never let a late "abandoned" beacon overwrite a finished round.
    if (target > 0) {
      var current = sheet.getRange(target, 7).getValue();
      if ((current === 'completed' || current === 'terminated') && body.status !== current) {
        return json({ ok: true, skipped: 'already ' + current });
      }
      sheet.getRange(target, 1, 1, LIVE_HEADERS.length).setValues([row]);
    } else {
      sheet.appendRow(row);
      target = sheet.getLastRow();
    }

    return json({ ok: true, progress: true, row: target });

  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function findRowByAttemptId(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {      // newest first
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

/* --------------------------------------------------------------------- */
/* GET — health check and leaderboard                                    */
/* --------------------------------------------------------------------- */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';

  if (action === 'leaderboard') {
    var limit = Math.min(parseInt((e.parameter.limit || LEADERBOARD_LIMIT), 10) || LEADERBOARD_LIMIT, 50);
    return json({ ok: true, rows: leaderboard(limit) });
  }
  return json({ ok: true, message: 'PostgreSQL Debugging Test endpoint is live', time: new Date().toISOString() });
}

function leaderboard(limit) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();

  // Keep each student's best attempt only, keyed by enrolment number.
  var best = {};
  values.forEach(function (r) {
    var key = String(r[4] || r[2] || '').toLowerCase().trim();   // enrolment, else name
    if (!key || r[20] === true) return;                          // malpractice: not ranked
    var entry = {
      name: r[2], section: r[3], enrolment: r[4],
      score: Number(r[6]) || 0,
      accuracy: Number(r[12]) || 0,
      time: Number(r[15]) || 0
    };
    if (!best[key] || entry.score > best[key].score) best[key] = entry;
  });

  return Object.keys(best).map(function (k) { return best[k]; })
    .sort(function (a, b) { return b.score - a.score || a.time - b.time; })
    .slice(0, limit);
}

/* --------------------------------------------------------------------- */
/* helpers                                                               */
/* --------------------------------------------------------------------- */
function num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
