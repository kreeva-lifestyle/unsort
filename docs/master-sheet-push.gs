/**
 * DailyOffice — tell the app the master sheet changed.
 *
 * Paste this into the master sheet: Extensions → Apps Script → replace
 * everything in Code.gs → Save. Then pick "installPush" in the function
 * menu at the top and press Run once (Google asks you to allow it — allow).
 * From then on every edit, pasted block, added or deleted row reaches the
 * app within about a minute.
 *
 * What it sends: nothing from the sheet. It only says "the sheet changed";
 * the app then reads the sheet itself, exactly as before. The key below is
 * the project's publishable key (public by design — short, so it survives
 * copy-paste) and can do nothing except ask for that sync.
 *
 * Server side: supabase/migrations/20261027120000_master_sheet_push.sql.
 */

var PUSH_URL = 'https://ulphprdnswznfztawbvg.supabase.co/rest/v1/rpc/master_sheet_touch';
var APP_KEY = 'sb_publishable_Z67R9KK8U_UFStsrBxNz5A_XrhWGoYw';

/** Runs on every change to the sheet (set up by installPush). */
function onSheetChange(e) {
  tellApp_();
}

/** Run once. Safe to run again: it never adds a second copy of the trigger. */
function installPush() {
  var ss = SpreadsheetApp.getActive();
  var have = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onSheetChange'; });
  if (!have) ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss).onChange().create();
  var code = tellApp_();
  ss.toast(code < 300 ? 'Connected — the app will now pick up changes within a minute.' : 'Installed, but the app did not answer (' + code + '). Send this message to the office.', 'DailyOffice', 10);
}

/** Removes the push. The app keeps checking the sheet every 30 minutes, and every 2 minutes again once a week passes without a push. */
function removePush() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'onSheetChange') ScriptApp.deleteTrigger(t); });
  SpreadsheetApp.getActive().toast('Removed. The app checks the sheet on its own (every 30 minutes, every 2 minutes after a week).', 'DailyOffice', 8);
}

function tellApp_() {
  try {
    var r = UrlFetchApp.fetch(PUSH_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: '{}',
      headers: { apikey: APP_KEY },
      muteHttpExceptions: true,
    });
    var code = r.getResponseCode();
    if (code >= 300) console.warn('DailyOffice push answered ' + code + ': ' + r.getContentText().slice(0, 200));
    return code;
  } catch (err) {
    // No internet from Google, or a quota hit: the app's own 30-minute check still catches the change.
    console.warn('DailyOffice push failed: ' + err);
    return 0;
  }
}
