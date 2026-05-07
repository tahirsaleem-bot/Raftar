const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../logger');

const CREDENTIALS_PATH = path.join(__dirname, '..', '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, '..', '..', 'credentials', 'google-token.json');

// ─── Google Sheets Auth (OAuth — same token used for Gmail + Calendar) ────────
function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) throw new Error('OAuth credentials not found. Run: node scripts/authorize.js');
  if (!fs.existsSync(TOKEN_PATH)) throw new Error('OAuth token not found. Run: node scripts/authorize.js');

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const { client_id, client_secret } = credentials.installed || credentials.web;

  const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  auth.setCredentials(token);
  return auth;
}

async function getSheet() {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

// ─── Sheet Column Layout ──────────────────────────────────────────────────────
// A: Date | B: Team Member | C: Phone | D: KM | E: Source Message
// F: Submitted At | G: Status | H: Reminder Sent | I: Notes

const COLUMNS = ['Date', 'Team Member', 'Phone', 'KM', 'Source Message', 'Submitted At', 'Status', 'Reminder Sent', 'Notes'];

// ─── Ensure Header Row Exists ─────────────────────────────────────────────────
async function ensureHeaders() {
  try {
    const sheets = await getSheet();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetId,
      range: `${config.google.sheetName}!A1:I1`,
    });

    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.google.sheetId,
        range: `${config.google.sheetName}!A1:I1`,
        valueInputOption: 'RAW',
        requestBody: { values: [COLUMNS] },
      });
      logger.info('[sheets] Header row created');
    }
  } catch (err) {
    logger.error('[sheets] Failed to ensure headers:', err.message);
  }
}

// ─── Write a new KM record ────────────────────────────────────────────────────
async function writeKMRecord(record) {
  try {
    const sheets = await getSheet();
    const row = recordToRow(record);

    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.sheetId,
      range: `${config.google.sheetName}!A:I`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    logger.info(`[sheets] Record written: ${record.teamMember} | ${record.date} | ${record.km} KM`);
    return { success: true };
  } catch (err) {
    logger.error('[sheets] Failed to write record:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Check if a record already exists for member + date ──────────────────────
async function recordExists(teamMember, date) {
  try {
    const rows = await getAllRows();
    return rows.find(r => r.teamMember === teamMember && r.date === date) || null;
  } catch (err) {
    logger.error('[sheets] Failed to check record existence:', err.message);
    return null;
  }
}

// ─── Update an existing record (for duplicate latest policy) ─────────────────
async function updateKMRecord(teamMember, date, updatedRecord) {
  try {
    const sheets = await getSheet();
    const rows = await getAllRowsRaw();

    const rowIndex = rows.findIndex(
      r => r[1] === teamMember && r[0] === date
    );

    if (rowIndex === -1) {
      logger.warn(`[sheets] No row found to update for ${teamMember} on ${date}`);
      return { success: false };
    }

    const sheetRow = rowIndex + 2; // +1 for header, +1 for 1-based index
    const newRow = recordToRow(updatedRecord);

    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.sheetId,
      range: `${config.google.sheetName}!A${sheetRow}:I${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [newRow] },
    });

    logger.info(`[sheets] Record updated: ${teamMember} | ${date}`);
    return { success: true };
  } catch (err) {
    logger.error('[sheets] Failed to update record:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Get all submitted members for a given date ───────────────────────────────
async function getSubmittedMembersForDate(date) {
  try {
    const rows = await getAllRows();
    return rows
      .filter(r => r.date === date && r.status === 'submitted')
      .map(r => r.teamMember);
  } catch (err) {
    logger.error('[sheets] Failed to get submitted members:', err.message);
    return [];
  }
}

// ─── Mark reminder sent for a member on a date ───────────────────────────────
async function markReminderSent(teamMember, date, value = 'yes') {
  try {
    const sheets = await getSheet();
    const rows = await getAllRowsRaw();

    const rowIndex = rows.findIndex(
      r => r[1] === teamMember && r[0] === date
    );

    if (rowIndex !== -1) {
      const sheetRow = rowIndex + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.google.sheetId,
        range: `${config.google.sheetName}!H${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[value]] },
      });
    } else {
      // Member has no row yet — insert a "missing" placeholder
      const row = recordToRow({
        date,
        teamMember,
        phone: '',
        km: '',
        sourceMessage: '',
        submittedAt: '',
        status: 'missing',
        reminderSent: value,
        notes: 'Auto-created by reminder checker',
      });
      const sheetsFull = await getSheet();
      await sheetsFull.spreadsheets.values.append({
        spreadsheetId: config.google.sheetId,
        range: `${config.google.sheetName}!A:I`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      });
    }

    logger.info(`[sheets] Reminder marked for ${teamMember} on ${date}`);
    return { success: true };
  } catch (err) {
    logger.error('[sheets] Failed to mark reminder:', err.message);
    return { success: false };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function recordToRow(r) {
  return [r.date, r.teamMember, r.phone, r.km, r.sourceMessage, r.submittedAt, r.status, r.reminderSent, r.notes];
}

async function getAllRowsRaw() {
  const sheets = await getSheet();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetId,
    range: `${config.google.sheetName}!A2:I`,
  });
  return res.data.values || [];
}

async function getAllRows() {
  const raw = await getAllRowsRaw();
  return raw.map(r => ({
    date: r[0],
    teamMember: r[1],
    phone: r[2],
    km: r[3],
    sourceMessage: r[4],
    submittedAt: r[5],
    status: r[6],
    reminderSent: r[7],
    notes: r[8],
  }));
}

module.exports = {
  ensureHeaders,
  writeKMRecord,
  recordExists,
  updateKMRecord,
  getSubmittedMembersForDate,
  markReminderSent,
};
