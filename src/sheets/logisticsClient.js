const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const { retry } = require('../utils/retry');

const CREDENTIALS_PATH = path.join(__dirname, '..', '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH       = path.join(__dirname, '..', '..', 'credentials', 'google-token.json');

const SHEET_ID  = process.env.LOGISTICS_SHEET_ID;
const SHEET_TAB = process.env.LOGISTICS_SHEET_TAB || 'Niete dedicated fleet';

// Logistics sheet column layout (A=0 … L=11)
// A: Sr No | B: Date | C: Regions | D: Coaches | E: Hub
// F: Driver | G: Vehicle | H: Sign In | I: Sign Out
// J: FPU Reading | K: LDO Reading | L: Total Reading

const COL = { srNo:0, date:1, region:2, coaches:3, hub:4, driver:5, vehicle:6,
              signIn:7, signOut:8, fpu:9, ldo:10, total:11 };

function getAuth() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const { client_id, client_secret } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  auth.setCredentials(token);
  return auth;
}

async function getAllRows() {
  try {
    return await retry(async () => {
      const sheets = google.sheets({ version: 'v4', auth: getAuth() });
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!A1:L`,
      });
      return res.data.values || [];
    }, { label: '[logistics]' });
  } catch (err) {
    logger.error('[logistics] getAllRows failed after retries:', err.message);
    return [];
  }
}

// ─── Find the sheet row number (1-based) for a hub on a given date ────────────
// date format: DD-MM-YYYY (matches sheet format)
async function findHubRow(hubName, dateStr) {
  const rows = await getAllRows();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowDate = (row[COL.date] || '').trim();
    const rowHub  = (row[COL.hub]  || '').trim().toLowerCase();
    if (rowDate === dateStr && rowHub === hubName.trim().toLowerCase()) {
      return { rowNumber: i + 1, row }; // 1-based
    }
  }
  return null;
}

// ─── Get FPU reading for a hub on a given date ────────────────────────────────
async function getFPU(hubName, dateStr) {
  const found = await findHubRow(hubName, dateStr);
  if (!found) {
    logger.warn(`[logistics] No row found for hub "${hubName}" on ${dateStr}`);
    return null;
  }
  const fpuRaw = (found.row[COL.fpu] || '').trim();
  if (fpuRaw.toLowerCase() === 'off' || fpuRaw === '') return null;
  const fpu = parseFloat(fpuRaw);
  return isNaN(fpu) ? null : fpu;
}

// ─── Update LDO and Total columns for a hub on a given date ──────────────────
async function updateLDOAndTotal(hubName, dateStr, ldo) {
  try {
    const found = await findHubRow(hubName, dateStr);
    if (!found) {
      logger.warn(`[logistics] Cannot update — no row for hub "${hubName}" on ${dateStr}`);
      return { success: false, reason: 'Row not found' };
    }

    const fpuRaw = (found.row[COL.fpu] || '').trim();
    const fpu = parseFloat(fpuRaw);
    const total = isNaN(fpu) ? '' : Math.round((ldo - fpu) * 10) / 10;

    const rowNumber = found.rowNumber;

    await retry(async () => {
      const sheets = google.sheets({ version: 'v4', auth: getAuth() });
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: {
          valueInputOption: 'RAW',
          data: [
            { range: `${SHEET_TAB}!K${rowNumber}`, values: [[String(ldo)]] },
            { range: `${SHEET_TAB}!L${rowNumber}`, values: [[String(total)]] },
          ],
        },
      });
    }, { label: '[logistics]' });

    logger.info(`[logistics] Updated ${hubName} | FPU:${fpu} LDO:${ldo} Total:${total}`);
    return { success: true, fpu, ldo, total };
  } catch (err) {
    logger.error('[logistics] updateLDOAndTotal failed:', err.message);
    return { success: false, reason: err.message };
  }
}

// ─── Get today's date in DD-MM-YYYY format (sheet format) ────────────────────
function todaySheetDate(timezone = 'Asia/Karachi') {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(now);
  const d = {};
  parts.forEach(p => { d[p.type] = p.value; });
  return `${d.day}-${d.month}-${d.year}`;
}

// ─── Add today's empty rows for all hubs (if not already added) ──────────────
async function addDailyRows(dateStr, coachMap = {}) {
  try {
    const { HUB_GROUPS } = require('../config/hubGroups');
    const rows = await getAllRows();

    // Check if today's rows already exist
    const alreadyExists = rows.some(r => (r[COL.date] || '').trim() === dateStr);
    if (alreadyExists) {
      logger.info(`[logistics] Rows for ${dateStr} already exist — skipping`);
      return;
    }

    // Region mapping
    const regionMap = {
      'E-9 AHQ':           'B.K',
      'lane 6':            'Nilore',
      'Khawaja corporation':'Sihala',
      'Tramri Chowk':      'Sihala',
      'H-13 Tarnol':       'Tarnol',
      'I-10 Tarnol':       'Tarnol',
      'Misrial Road':      'Tarnol',
    };

    const newRows = HUB_GROUPS.map((hub, i) => [
      String(i + 1),
      dateStr,
      regionMap[hub.hubName] || '',
      coachMap[hub.hubName] || '',
      hub.hubName,
      '', '', '', '', '', '', '',
    ]);

    await retry(async () => {
      const sheets = google.sheets({ version: 'v4', auth: getAuth() });
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!A:L`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: newRows },
      });
    }, { label: '[logistics]' });

    logger.info(`[logistics] Added ${newRows.length} rows for ${dateStr}`);
  } catch (err) {
    logger.error('[logistics] addDailyRows failed:', err.message);
  }
}

// ─── Update FPU column for a hub on a given date ──────────────────────────────
async function updateFPU(hubName, dateStr, fpu) {
  try {
    const found = await findHubRow(hubName, dateStr);
    if (!found) {
      logger.warn(`[logistics] Cannot update FPU — no row for "${hubName}" on ${dateStr}`);
      return { success: false };
    }

    await retry(async () => {
      const sheets = google.sheets({ version: 'v4', auth: getAuth() });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!J${found.rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[String(fpu)]] },
      });
    }, { label: '[logistics]' });

    logger.info(`[logistics] FPU updated for ${hubName}: ${fpu}`);
    return { success: true };
  } catch (err) {
    logger.error('[logistics] updateFPU failed:', err.message);
    return { success: false };
  }
}

module.exports = { getFPU, updateLDOAndTotal, updateFPU, addDailyRows, findHubRow, todaySheetDate, getAllRows };
