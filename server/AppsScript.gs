// ============================================================
// Pack Time — Google Apps Script Backend
// ============================================================
// Deploy this as a Web App:
// 1. Go to https://script.google.com
// 2. Create a new project, paste this code
// 3. Deploy → New deployment → Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 4. Copy the deployment URL
// 5. Paste it in PackTime.tsx as APPS_SCRIPT_URL
// ============================================================

const SPREADSHEET_ID = '1Jm326Q3AKLgCRioWWRCZ0LD4ENYQGBpBBCNQvFBRQm0';

const COURIER_SHEETS = {
  'XpressBees': 'Sheet1',
  'Shadow Fax': 'Sheet2',
  'Delhivery': 'Sheet3',
  'Ecom Express': 'Sheet4',
  'Amazon': 'Sheet5',
  'Mirraw': 'Sheet6',
};

// Handle GET requests
function doGet(e) {
  const action = e.parameter.action;

  if (action === 'health') {
    return jsonResponse({ ok: true });
  }

  if (action === 'verify') {
    return handleVerify(e.parameter.courier);
  }

  if (action === 'stats') {
    return handleStats();
  }

  return jsonResponse({ error: 'Unknown action' });
}

// Handle POST requests
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const action = data.action;

  if (action === 'scan') {
    return handleScan(data.awb, data.courier, data.cameraNumber);
  }

  if (action === 'verify') {
    return handleVerify(data.courier);
  }

  return jsonResponse({ error: 'Unknown action' });
}

// ── Verify Sheet ────────────────────────────────────────────
function handleVerify(courier) {
  if (!courier) return jsonResponse({ ok: false, error: 'Missing courier' });

  const sheetName = COURIER_SHEETS[courier];
  if (!sheetName) return jsonResponse({ ok: false, error: 'No sheet mapping for "' + courier + '"' });

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      const available = ss.getSheets().map(s => s.getName()).join(', ');
      return jsonResponse({
        ok: false,
        error: 'Sheet tab "' + sheetName + '" not found',
        details: 'Expected tab "' + sheetName + '" for "' + courier + '". Available: ' + available,
      });
    }

    const lastRow = sheet.getLastRow();

    // Check headers if data exists
    let columnsOk = true;
    let columnsInfo = '';

    if (lastRow > 0) {
      const firstRow = sheet.getRange(1, 1, 1, 4).getValues()[0];
      const isHeader = isNaN(Number(firstRow[0]));

      if (isHeader) {
        const headers = firstRow.map(h => String(h || '').toLowerCase());
        const missing = [];
        if (!headers.some(h => h.includes('count') || h === '#' || h.includes('sr'))) missing.push('Count (A)');
        if (!headers.some(h => h.includes('awb') || h.includes('barcode'))) missing.push('AWB (B)');
        if (!headers.some(h => h.includes('time') || h.includes('date'))) missing.push('Timestamp (C)');
        if (!headers.some(h => h.includes('cam'))) missing.push('Camera (D)');

        if (missing.length > 0) {
          columnsOk = false;
          columnsInfo = 'Missing: ' + missing.join(', ');
        }
      }
    }

    return jsonResponse({
      ok: true,
      sheetName: sheetName,
      columnsOk: columnsOk,
      columnsInfo: columnsInfo,
      totalRows: lastRow,
    });

  } catch (err) {
    return jsonResponse({ ok: false, error: 'Error: ' + err.message });
  }
}

// ── Scan AWB ────────────────────────────────────────────────
function handleScan(awb, courier, cameraNumber) {
  if (!awb || !courier || !cameraNumber) {
    return jsonResponse({ error: 'Missing fields' });
  }

  const sheetName = COURIER_SHEETS[courier];
  if (!sheetName) return jsonResponse({ error: 'Unknown courier' });

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return jsonResponse({ error: 'Sheet not found: ' + sheetName });

    const lastRow = sheet.getLastRow();

    // Check duplicate — scan column B for matching AWB
    if (lastRow > 0) {
      const awbColumn = sheet.getRange(1, 2, lastRow, 1).getValues();
      for (let i = 0; i < awbColumn.length; i++) {
        if (String(awbColumn[i][0]).trim() === awb.trim()) {
          return jsonResponse({ success: false, duplicate: true, awb: awb });
        }
      }
    }

    // Check if we need a day separator
    const now = new Date();
    const today = formatDate(now);
    let needSeparator = false;

    if (lastRow > 0) {
      // Find last non-empty row
      for (let i = lastRow; i >= 1; i--) {
        const val = sheet.getRange(i, 1).getValue();
        if (val !== '' && val !== null) {
          const ts = String(sheet.getRange(i, 3).getValue());
          if (ts) {
            const lastDate = ts.split(' ')[0];
            if (lastDate && lastDate !== today) {
              needSeparator = true;
            }
          }
          break;
        }
      }
    }

    // Count data rows (non-empty in col A)
    let count = 0;
    if (lastRow > 0) {
      const colA = sheet.getRange(1, 1, lastRow, 1).getValues();
      count = colA.filter(r => r[0] !== '' && r[0] !== null).length;
    }
    const nextCount = count + 1;

    const timestamp = formatTimestamp(now);

    // Append
    if (needSeparator) {
      sheet.appendRow(['', '', '', '']);
    }
    sheet.appendRow([nextCount, awb.trim(), timestamp, String(cameraNumber)]);

    return jsonResponse({
      success: true,
      duplicate: false,
      awb: awb.trim(),
      count: nextCount,
      timestamp: timestamp,
    });

  } catch (err) {
    return jsonResponse({ error: 'Scan failed: ' + err.message });
  }
}

// ── Stats ───────────────────────────────────────────────────
function handleStats() {
  const today = formatDate(new Date());
  const stats = {};

  for (const courier in COURIER_SHEETS) {
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const sheet = ss.getSheetByName(COURIER_SHEETS[courier]);
      if (!sheet) { stats[courier] = { today: 0, total: 0 }; continue; }

      const lastRow = sheet.getLastRow();
      if (lastRow === 0) { stats[courier] = { today: 0, total: 0 }; continue; }

      const data = sheet.getRange(1, 1, lastRow, 3).getValues();
      const total = data.filter(r => r[0] !== '' && r[0] !== null).length;
      const todayCount = data.filter(r => String(r[2]).startsWith(today)).length;
      stats[courier] = { today: todayCount, total: total };
    } catch {
      stats[courier] = { today: 0, total: 0 };
    }
  }

  return jsonResponse({ date: today, stats: stats });
}

// ── Helpers ─────────────────────────────────────────────────
function formatDate(d) {
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
}

function formatTimestamp(d) {
  return formatDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function pad(n) { return n < 10 ? '0' + n : String(n); }

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
