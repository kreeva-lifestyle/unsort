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
