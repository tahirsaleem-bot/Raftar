const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const { retry } = require('../utils/retry');

const CREDENTIALS_PATH = path.join(__dirname, '..', '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH       = path.join(__dirname, '..', '..', 'credentials', 'google-token.json');

const SHEET_ID = process.env.LOGISTICS_SHEET_ID;

// ─── Fleets ───────────────────────────────────────────────────────────────────
// One tab per fleet, each with its own column layout (see FLEETS in
// src/config/hubGroups.js):
//   Islamabad  "Niete Dedicated Fleet"       A..L  FPU=J  LDO=K  Total=L
//   Rawalpindi "Rawalpindi Dedicated Fleet"  A..H  FPU=F  LDO=G  Total=H
// Every sheet function below is built per fleet by createFleetClient(). The
// module's top-level exports are the Islamabad client, so every existing
// caller keeps its exact behaviour; use forHub(hubName) / forFleet(key) for
// anything that may be a Rawalpindi hub.
//
// Islamabad layout (A=0 … L=11)
// A: Sr No | B: Date | C: Regions | D: Coaches | E: Hub
// F: Driver | G: Vehicle | H: Sign In | I: Sign Out
// J: FPU Reading | K: LDO Reading | L: Total Reading

function getAuth() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const { client_id, client_secret } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  auth.setCredentials(token);
  return auth;
}

const colLetter = i => String.fromCharCode(65 + i);

// ─── Date matching ────────────────────────────────────────────────────────────
// The sheet does NOT use one consistent date format. Older rows are DD-MM-YYYY
// (e.g. 17-04-2024) while every recent row is MM-DD-YYYY (e.g. 08-28-2026), and
// `todaySheetDate()` produces DD-MM-YYYY. A plain string compare therefore fails
// on today's row — verified 2026-08-28: findHubRow('I-10 Tarnol','28-08-2026')
// returned null while the real row 4401 held '08-28-2026'. That silently broke
// getFPU/updateFPU/updateLDOAndTotal, so no reading could ever be written.
// We now compare the parsed calendar date instead of the raw string.
function parseSheetDate(s) {
  const str = String(s || '').trim();
  // ISO YYYY-MM-DD is the CANONICAL form every lookup should use. It is
  // unambiguous, so accept it first and hand it straight back. Before this
  // existed, handleMessage passed an ISO dateKey, the regex below rejected it,
  // parseSheetDate returned null, findHubRow never matched and EVERY meter
  // reading was silently dropped (verified 2026-09-08, all 7 hubs).
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${String(+iso[2]).padStart(2, '0')}-${String(+iso[3]).padStart(2, '0')}`;
  }
  const m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!m) return null;
  const a = +m[1], b = +m[2], year = +m[3];
  // Disambiguate by whichever part cannot be a month.
  if (a > 12 && b <= 12) return `${year}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`; // DD-MM
  if (b > 12 && a <= 12) return `${year}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`; // MM-DD
  if (a > 12 && b > 12) return null;
  // Ambiguous (both <= 12): follow the sheet's prevailing recent format, MM-DD.
  return `${year}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
}

function sameDate(x, y) {
  if (String(x).trim() === String(y).trim()) return true; // fast path, exact match
  const px = parseSheetDate(x), py = parseSheetDate(y);
  return !!px && !!py && px === py;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
// READ THIS BEFORE CHANGING ANY DATE CODE (re-verified 2026-10-21):
// the spreadsheet locale is en_US and the Date column holds REAL date values
// (serials such as 46315) displayed with the pattern mm-dd-yyyy. The old note
// here claimed typed DD-MM was parsed as a date; with valueInputOption RAW it
// is not — '21-10-2026' was stored as plain text. Hence:
//   * every LOOKUP key must be ISO -> todayISO() (matches via parseSheetDate)
//   * a CELL WRITE of a date is a serial number + DATE format (see addDailyRows)
// sheetWriteDate() is kept for old callers only; do not use it for new writes.

// Today as ISO YYYY-MM-DD — use this for ALL row lookups and comparisons.
function todayISO(timezone = 'Asia/Karachi') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(new Date());
  const d = {};
  parts.forEach(pp => { d[pp.type] = pp.value; });
  return `${d.year}-${d.month}-${d.day}`;
}

// ISO -> DD-MM-YYYY. Legacy only — see the note above.
function sheetWriteDate(isoDate) {
  const m = String(isoDate || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return String(isoDate || '').trim(); // already sheet-shaped; leave alone
  return `${String(+m[3]).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}-${m[1]}`;
}

// DEPRECATED for lookups — use todayISO(). Kept for older callers.
function todaySheetDate(timezone = 'Asia/Karachi') {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(now);
  const d = {};
  parts.forEach(p => { d[p.type] = p.value; });
  return `${d.day}-${d.month}-${d.year}`;
}

// ─── Working days ─────────────────────────────────────────────────────────────
// Readings are logged Monday-Friday only (Tahir, 2026-10-20): no rows are
// created and nothing is written on Saturday/Sunday. WORK_DAYS overrides it as
// a comma list of ISO weekdays (1 = Monday ... 7 = Sunday).
const WORK_DAYS = (process.env.WORK_DAYS || '1,2,3,4,5').split(',').map(Number);
function isWorkday(isoDate) {
  const d = new Date(`${isoDate}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return WORK_DAYS.includes(d === 0 ? 7 : d);
}

// ─── Per-fleet client ─────────────────────────────────────────────────────────
function createFleetClient(fleetKey) {
  const { FLEETS } = require('../config/hubGroups');
  const fleet = FLEETS[fleetKey];
  if (!fleet) throw new Error(`Unknown fleet "${fleetKey}"`);
  const SHEET_TAB = fleet.tab;
  const COL = fleet.col;
  const WIDTH = fleet.width;
  const LAST = colLetter(WIDTH - 1);
  const FPU = colLetter(COL.fpu), LDO = colLetter(COL.ldo), TOT = colLetter(COL.total);
  const tag = `[logistics${fleetKey === 'islamabad' ? '' : ':' + fleetKey}]`;

  async function getAllRows() {
    try {
      return await retry(async () => {
        const sheets = google.sheets({ version: 'v4', auth: getAuth() });
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_TAB}!A1:${LAST}`,
        });
        return res.data.values || [];
      }, { label: tag });
    } catch (err) {
      logger.error(`${tag} getAllRows failed after retries:`, err.message);
      return [];
    }
  }

  // ─── Find the sheet row number (1-based) for a hub on a given date ──────────
  // dateStr may be ISO, DD-MM-YYYY or MM-DD-YYYY; matching is format-agnostic.
  async function findHubRow(hubName, dateStr) {
    const rows = await getAllRows();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowDate = (row[COL.date] || '').trim();
      const rowHub  = (row[COL.hub]  || '').trim().toLowerCase();
      if (sameDate(rowDate, dateStr) && rowHub === hubName.trim().toLowerCase()) {
        return { rowNumber: i + 1, row }; // 1-based
      }
    }
    return null;
  }

  // ─── Get FPU reading for a hub on a given date ──────────────────────────────
  async function getFPU(hubName, dateStr) {
    const found = await findHubRow(hubName, dateStr);
    if (!found) {
      logger.warn(`${tag} No row found for hub "${hubName}" on ${dateStr}`);
      return null;
    }
    const fpuRaw = (found.row[COL.fpu] || '').trim();
    if (fpuRaw.toLowerCase() === 'off' || fpuRaw === '') return null;
    const fpu = parseFloat(fpuRaw.replace(/,/g, ''));
    return isNaN(fpu) ? null : fpu;
  }

  // ─── Update LDO and Total columns for a hub on a given date ────────────────
  async function updateLDOAndTotal(hubName, dateStr, ldo) {
    try {
      const found = await findHubRow(hubName, dateStr);
      if (!found) {
        logger.warn(`${tag} Cannot update — no row for hub "${hubName}" on ${dateStr}`);
        return { success: false, reason: 'Row not found' };
      }

      const fpuRaw = (found.row[COL.fpu] || '').trim();
      const fpu = parseFloat(fpuRaw.replace(/,/g, ''));
      const total = isNaN(fpu) ? '' : Math.round((ldo - fpu) * 10) / 10;

      const rowNumber = found.rowNumber;

      await retry(async () => {
        const sheets = google.sheets({ version: 'v4', auth: getAuth() });
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          // The sheet keeps Total as the formula =LDO-FPU (verified 2026-10-21);
          // writing a number here used to overwrite that formula. Readings are
          // numbers, not text, so the sheet's own sums include them.
          resource: {
            valueInputOption: 'USER_ENTERED',
            data: [
              { range: `${SHEET_TAB}!${LDO}${rowNumber}`, values: [[Number(ldo)]] },
              { range: `${SHEET_TAB}!${TOT}${rowNumber}`, values: [[`=${LDO}${rowNumber}-${FPU}${rowNumber}`]] },
            ],
          },
        });
      }, { label: tag });

      logger.info(`${tag} Updated ${hubName} | FPU:${fpu} LDO:${ldo} Total:${total}`);
      return { success: true, fpu, ldo, total };
    } catch (err) {
      logger.error(`${tag} updateLDOAndTotal failed:`, err.message);
      return { success: false, reason: err.message };
    }
  }

  // ─── Add a day's block (header + one row per hub), once ────────────────────
  // Serialised so two photos arriving together cannot both append a day.
  let addDailyRowsChain = Promise.resolve();
  function addDailyRows(isoDate, coachMap = {}) {
    const run = addDailyRowsChain.then(() => addDailyRowsUnlocked(isoDate, coachMap));
    addDailyRowsChain = run.catch(() => {});
    return run;
  }

  // Appends one day's block exactly the way the sheet is kept by hand
  // (Tahir, 2026-10-21): the coloured "Sr No | Date | …" header row, then one
  // row per hub. Formatting (header colour, borders, region chips, date
  // format) is copied from the previous day's block, region and coaches are
  // carried over from each hub's previous row, the date is written as a real
  // date value and Total is the live formula =LDO-FPU.
  async function addDailyRowsUnlocked(isoDate, coachMap = {}) {
    try {
      const hubs = fleet.hubs();
      const rows = await getAllRows();
      const dateStr = isoDate;

      // Format-agnostic, so a block can never be appended twice for one day.
      const alreadyExists = rows.some(r => sameDate((r[COL.date] || '').trim(), dateStr));
      if (alreadyExists) {
        logger.info(`${tag} Rows for ${dateStr} already exist — skipping`);
        return;
      }

      const lastRowFor = hub => {
        for (let i = rows.length - 1; i >= 0; i--) if ((rows[i][COL.hub] || '').trim() === hub) return rows[i];
        return null;
      };
      let headerIdx = -1;
      for (let i = rows.length - 1; i >= 0; i--) if ((rows[i][COL.srNo] || '').trim() === 'Sr No') { headerIdx = i; break; }
      const header = headerIdx >= 0 ? rows[headerIdx].slice(0, WIDTH) : fleet.header.slice();
      while (header.length < WIDTH) header.push('');

      // Google Sheets date serial (days since 1899-12-30)
      const [y, m, d] = isoDate.split('-').map(Number);
      const serial = (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
      const dayRows = hubs.map((hub, i) => {
        const prev = lastRowFor(hub.hubName);
        const r = new Array(WIDTH).fill('');
        r[COL.srNo] = i + 1;
        r[COL.date] = serial;
        r[COL.region] = (prev && prev[COL.region]) || fleet.regionMap[hub.hubName] || '';
        r[COL.coaches] = coachMap[hub.hubName] || (prev && prev[COL.coaches]) || '';
        r[COL.hub] = hub.hubName;
        return r;
      });

      const sheets = google.sheets({ version: 'v4', auth: getAuth() });
      const appended = await retry(async () => sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!A:${LAST}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [header, ...dayRows] },
      }), { label: tag });

      // Copy the previous block's formatting onto the new one. Best effort: if
      // it fails the values are still correct, only the colours are missing.
      try {
        const startRow = parseInt(String(appended.data.updates.updatedRange).match(/!A(\d+)/)[1], 10) - 1; // 0-based
        const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
        // Sheets ranges ignore case but this lookup did not: env "Niete Dedicated fleet" left 27 Oct unformatted
        const sheetId = meta.data.sheets.find(s => s.properties.title.toLowerCase() === SHEET_TAB.toLowerCase()).properties.sheetId;
        const n = dayRows.length + 1;
        const requests = [];
        if (headerIdx >= 0) {
          requests.push({ copyPaste: {
            source: { sheetId, startRowIndex: headerIdx, endRowIndex: headerIdx + n, startColumnIndex: 0, endColumnIndex: WIDTH },
            destination: { sheetId, startRowIndex: startRow, endRowIndex: startRow + n, startColumnIndex: 0, endColumnIndex: WIDTH },
            pasteType: 'PASTE_FORMAT',
          } });
        }
        // INSERT_ROWS inherits the region dropdown from the row above; the
        // header row must not have one.
        requests.push({ setDataValidation: {
          range: { sheetId, startRowIndex: startRow, endRowIndex: startRow + 1, startColumnIndex: 0, endColumnIndex: WIDTH },
        } });
        requests.push({ repeatCell: {
          range: { sheetId, startRowIndex: startRow + 1, endRowIndex: startRow + n, startColumnIndex: COL.date, endColumnIndex: COL.date + 1 },
          cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'mm-dd-yyyy' } } },
          fields: 'userEnteredFormat.numberFormat',
        } });
        await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
        // Total = LDO - FPU as a live formula, like the hand-kept rows. Until the
        // LDO arrives it shows 0: an odometer FPU on its own made it -41874
        // (Gulraiz, 2026-10-27). updateLDOAndTotal writes the plain =LDO-FPU.
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_TAB}!${TOT}${startRow + 2}:${TOT}${startRow + n}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: dayRows.map((_, i) => { const r = startRow + 2 + i; return [`=IF(${LDO}${r}="",0,${LDO}${r}-${FPU}${r})`]; }) },
        });
      } catch (err) {
        logger.warn(`${tag} Rows for ${dateStr} added but formatting copy failed: ${err.message}`);
      }

      logger.info(`${tag} Added header + ${dayRows.length} rows for ${dateStr}`);
    } catch (err) {
      logger.error(`${tag} addDailyRows failed:`, err.message);
    }
  }

  // ─── Update FPU column for a hub on a given date ────────────────────────────
  async function updateFPU(hubName, dateStr, fpu) {
    try {
      const found = await findHubRow(hubName, dateStr);
      if (!found) {
        logger.warn(`${tag} Cannot update FPU — no row for "${hubName}" on ${dateStr}`);
        return { success: false };
      }

      await retry(async () => {
        const sheets = google.sheets({ version: 'v4', auth: getAuth() });
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_TAB}!${FPU}${found.rowNumber}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[Number(fpu)]] },
        });
      }, { label: tag });

      logger.info(`${tag} FPU updated for ${hubName}: ${fpu}`);
      return { success: true };
    } catch (err) {
      logger.error(`${tag} updateFPU failed:`, err.message);
      return { success: false };
    }
  }

  // ─── Most recent numeric reading recorded for a hub ────────────────────────
  // Scans the sheet bottom-up and returns the newest LDO (preferred) or FPU value
  // for `hubName`, skipping the row for `excludeIso` and skipping 'off'/blank.
  // Used to sanity-check odometer hubs, where a plain KM_MAX bound is useless
  // (real values run into six figures) but a sudden jump means bad OCR.
  async function getLastReading(hubName, excludeIso = null) {
    const rows = await getAllRows();
    const target = hubName.trim().toLowerCase();
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if ((row[COL.hub] || '').trim().toLowerCase() !== target) continue;
      if (excludeIso && sameDate((row[COL.date] || '').trim(), excludeIso)) continue;
      for (const col of [COL.ldo, COL.fpu]) {
        const raw = (row[col] || '').trim().replace(/,/g, '');
        if (!raw || raw.toLowerCase() === 'off') continue;
        const v = parseFloat(raw);
        if (!isNaN(v) && v > 0) {
          const rawDate = (row[COL.date] || '').trim();
          // `iso` lets the caller work out how stale this baseline is.
          return { km: v, date: rawDate, iso: parseSheetDate(rawDate) };
        }
      }
    }
    return null;
  }

  // ─── Mark a hub's day as off (no visit) ─────────────────────────────────────
  // Writes the literal "off" into FPU, LDO and Total — the sheet's own
  // convention for a day off. Refuses if either reading is already filled.
  async function markOff(hubName, isoDate) {
    try {
      const found = await findHubRow(hubName, isoDate);
      if (!found) return { success: false, reason: 'Row not found' };
      const j = String(found.row[COL.fpu] || '').trim(), k = String(found.row[COL.ldo] || '').trim();
      if (j !== '' || k !== '') return { success: false, reason: `already has FPU="${j}" LDO="${k}"` };
      await retry(async () => {
        const sheets = google.sheets({ version: 'v4', auth: getAuth() });
        // FPU, LDO and Total are adjacent in both layouts
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_TAB}!${FPU}${found.rowNumber}:${TOT}${found.rowNumber}`,
          valueInputOption: 'RAW',
          requestBody: { values: [['off', 'off', 'off']] },
        });
      }, { label: tag });
      return { success: true, rowNumber: found.rowNumber };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  }

  return {
    fleet: fleetKey, label: fleet.label, tab: SHEET_TAB, COL, hubs: fleet.hubs, invoice: fleet.invoice,
    getAllRows, findHubRow, getFPU, updateLDOAndTotal, addDailyRows, updateFPU, getLastReading, markOff,
  };
}

const clients = {};
function forFleet(fleetKey) {
  if (!clients[fleetKey]) clients[fleetKey] = createFleetClient(fleetKey);
  return clients[fleetKey];
}
function forHub(hubName) {
  return forFleet(require('../config/hubGroups').fleetForHub(hubName));
}

// Top-level exports = the Islamabad client (unchanged behaviour for every
// existing caller), plus the shared date helpers and the fleet accessors.
const isb = forFleet('islamabad');
module.exports = {
  ...isb,
  forFleet, forHub,
  isWorkday, todaySheetDate, todayISO, sheetWriteDate, parseSheetDate, sameDate,
};
