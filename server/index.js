import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import { readFileSync } from 'fs';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const COURIER_SHEETS = {
  'XpressBees': 'Sheet1',
  'Shadow Fax': 'Sheet2',
  'Delhivery': 'Sheet3',
  'Ecom Express': 'Sheet4',
  'Amazon': 'Sheet5',
  'Mirraw': 'Sheet6',
};

// ── Google Sheets Auth ──────────────────────────────────────────────────────────
let sheets;
try {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './credentials.json';
  const creds = JSON.parse(readFileSync(keyPath, 'utf-8'));
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  sheets = google.sheets({ version: 'v4', auth });
  console.log('✓ Google Sheets authenticated');
} catch (err) {
  console.error('✗ Google Sheets auth failed:', err.message);
}

// ── Helpers ─────────────────────────────────────────────────────────────────────
function formatTimestamp(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${d}/${m}/${y} ${h}:${min}:${s}`;
}

function todayStr() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
}

// ── POST /api/verify-sheet ───────────────────────────────────────────────────────
app.post('/api/verify-sheet', async (req, res) => {
  try {
    const { courier } = req.body;
    if (!courier) return res.status(400).json({ ok: false, error: 'Missing courier' });

    const sheetName = COURIER_SHEETS[courier];
    if (!sheetName) return res.json({ ok: false, error: `No sheet mapping for "${courier}"` });

    // Check if the sheet/tab exists
    let sheetExists = false;
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
      const tabNames = (meta.data.sheets || []).map(s => s.properties?.title);
      sheetExists = tabNames.includes(sheetName);
      if (!sheetExists) {
        return res.json({
          ok: false,
          error: `Sheet tab "${sheetName}" not found in spreadsheet`,
          details: `Expected tab "${sheetName}" for courier "${courier}". Available tabs: ${tabNames.join(', ')}`,
        });
      }
    } catch (err) {
      return res.json({ ok: false, error: 'Cannot connect to Google Sheets. Check credentials and spreadsheet ID.' });
    }

    // Check columns structure — read first few rows
    try {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1:D2`,
      });
      const rows = result.data.values || [];
      // Sheet is accessible and readable. Check if it has header or data
      const expectedCols = ['Count', 'AWB', 'Timestamp', 'Camera'];
      let columnsOk = true;
      let columnsInfo = '';

      if (rows.length > 0) {
        const firstRow = rows[0];
        // Check if first row looks like headers or data
        const isHeader = firstRow[0] && isNaN(Number(firstRow[0]));
        if (isHeader) {
          // Validate header names loosely
          const headers = firstRow.map(h => (h || '').toString().trim().toLowerCase());
          const missing = [];
          if (!headers.some(h => h.includes('count') || h === '#' || h === 'sr' || h === 'no')) missing.push('Count (Col A)');
          if (!headers.some(h => h.includes('awb') || h.includes('barcode') || h.includes('tracking'))) missing.push('AWB (Col B)');
          if (!headers.some(h => h.includes('time') || h.includes('date') || h.includes('stamp'))) missing.push('Timestamp (Col C)');
          if (!headers.some(h => h.includes('cam') || h.includes('camera'))) missing.push('Camera (Col D)');
          if (missing.length > 0) {
            columnsOk = false;
            columnsInfo = `Missing columns: ${missing.join(', ')}. Expected: ${expectedCols.join(', ')}`;
          }
        }
        // If first row is data (starts with a number), columns structure can't be validated from headers but sheet is usable
      }
      // Empty sheet is fine — will auto-populate

      const dataRows = rows.length > 0 && isNaN(Number(rows[0][0])) ? rows.length - 1 : rows.length;

      return res.json({
        ok: true,
        sheetName,
        columnsOk,
        columnsInfo,
        totalRows: dataRows,
        expectedColumns: expectedCols,
      });
    } catch (err) {
      return res.json({ ok: false, error: `Cannot read sheet "${sheetName}": ${err.message}` });
    }
  } catch (err) {
    return res.json({ ok: false, error: 'Verification failed: ' + err.message });
  }
});

// ── POST /api/scan ──────────────────────────────────────────────────────────────
app.post('/api/scan', async (req, res) => {
  try {
    const { awb, courier, cameraNumber } = req.body;
    if (!awb || !courier || !cameraNumber) {
      return res.status(400).json({ error: 'Missing required fields: awb, courier, cameraNumber' });
    }

    const sheetName = COURIER_SHEETS[courier];
    if (!sheetName) {
      return res.status(400).json({ error: `Unknown courier: ${courier}` });
    }

    // Read all existing data to check for duplicates and get count
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:D`,
    });

    const rows = existing.data.values || [];

    // Check for duplicate AWB (column B, index 1)
    const isDuplicate = rows.some(row => row[1] && row[1].toString().trim() === awb.trim());
    if (isDuplicate) {
      return res.json({ success: false, duplicate: true, awb });
    }

    // Check if we need a day separator
    const now = new Date();
    const today = todayStr();
    let needSeparator = false;

    if (rows.length > 0) {
      // Find last non-empty row
      let lastDataRow = null;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i] && rows[i].length > 0 && rows[i][0] !== '') {
          lastDataRow = rows[i];
          break;
        }
      }
      if (lastDataRow && lastDataRow[2]) {
        // Extract date part from timestamp (DD/MM/YYYY HH:MM:SS)
        const lastDate = lastDataRow[2].split(' ')[0];
        if (lastDate && lastDate !== today) {
          needSeparator = true;
        }
      }
    }

    // Calculate next count (count non-empty rows in column A)
    const dataRowCount = rows.filter(r => r[0] && r[0] !== '').length;
    const nextCount = dataRowCount + 1;

    const timestamp = formatTimestamp(now);

    // Build rows to append
    const newRows = [];
    if (needSeparator) {
      newRows.push(['', '', '', '']); // blank separator row
    }
    newRows.push([nextCount, awb.trim(), timestamp, String(cameraNumber)]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:D`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });

    res.json({
      success: true,
      duplicate: false,
      awb: awb.trim(),
      count: nextCount,
      timestamp,
      courier,
      cameraNumber,
    });
  } catch (err) {
    console.error('Scan error:', err.message);
    res.status(500).json({ error: 'Failed to process scan: ' + err.message });
  }
});

// ── GET /api/session-stats ──────────────────────────────────────────────────────
app.get('/api/session-stats', async (req, res) => {
  try {
    const today = todayStr();
    const stats = {};

    for (const [courier, sheetName] of Object.entries(COURIER_SHEETS)) {
      try {
        const result = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheetName}!A:D`,
        });
        const rows = result.data.values || [];
        // Count rows where timestamp date matches today
        const todayCount = rows.filter(r => r[2] && r[2].startsWith(today)).length;
        const totalCount = rows.filter(r => r[0] && r[0] !== '').length;
        stats[courier] = { today: todayCount, total: totalCount };
      } catch {
        stats[courier] = { today: 0, total: 0 };
      }
    }

    res.json({ date: today, stats });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ── Health ───────────────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Pack Time server running on port ${PORT}`);
});
