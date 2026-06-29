// People Analyzer Logbook — Google Sheets storage.
// One central spreadsheet; each user gets their own tab, auto-created on first entry.
const { google } = require('googleapis');
const logger = require('../logger');
const { getAuth } = require('./googleAuth');

const SHEET_ID = process.env.PA_LOGBOOK_SHEET_ID;

const HEADERS = ['Date', 'Time', 'Entry', 'Category', 'Cycle'];
const ACCOUNTS_TAB = '_Accounts';
const HIDDEN_TABS = ['readme', ACCOUNTS_TAB.toLowerCase()];

function api() {
  if (!SHEET_ID) throw new Error('PA_LOGBOOK_SHEET_ID not set');
  return google.sheets({ version: 'v4', auth: getAuth() });
}

// Google tab titles can't contain : \ / ? * [ ] and are max 100 chars.
function safeTabName(name) {
  return (name || 'Unknown').replace(/[:\\/?*\[\]]/g, ' ').trim().slice(0, 90) || 'Unknown';
}

// 4-month cycle label from a Date: Jan-Apr, May-Aug, Sep-Dec.
function cycleLabel(d = new Date()) {
  const m = d.getMonth();
  const y = d.getFullYear();
  if (m <= 3) return `Jan-Apr ${y}`;
  if (m <= 7) return `May-Aug ${y}`;
  return `Sep-Dec ${y}`;
}

async function listTabs() {
  const meta = await api().spreadsheets.get({ spreadsheetId: SHEET_ID });
  return meta.data.sheets.map(s => s.properties.title);
}

async function listUsers() {
  const tabs = await listTabs();
  return tabs.filter(t => !HIDDEN_TABS.includes(t.toLowerCase()));
}

// ─── Accounts (login) — stored in a hidden _Accounts tab ──────────────────────
async function ensureAccountsTab() {
  const tabs = await listTabs();
  if (!tabs.includes(ACCOUNTS_TAB)) {
    const sheets = api();
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: ACCOUNTS_TAB } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${ACCOUNTS_TAB}'!A1:C1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Name', 'PinHash', 'CreatedAt']] },
    });
  }
}

async function getAccount(name) {
  await ensureAccountsTab();
  const res = await api().spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${ACCOUNTS_TAB}'!A2:C` });
  const rows = res.data.values || [];
  const i = rows.findIndex(r => (r[0] || '').trim().toLowerCase() === String(name).trim().toLowerCase());
  if (i === -1) return null;
  return { name: rows[i][0], pinHash: rows[i][1], rowNumber: i + 2 };
}

async function createAccount(name, pinHash) {
  await ensureAccountsTab();
  await api().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${ACCOUNTS_TAB}'!A:C`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[name, pinHash, new Date().toISOString()]] },
  });
  logger.info(`[pa] Account created: ${name}`);
}

// Ensure a tab exists for this user; create with headers if missing.
async function ensureUserTab(userName) {
  const tab = safeTabName(userName);
  const tabs = await listTabs();
  if (!tabs.includes(tab)) {
    const sheets = api();
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${tab}'!A1:E1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
    logger.info(`[pa] Created logbook tab for "${tab}"`);
  }
  return tab;
}

// Append one entry. date/time/cycle default to now if not provided.
async function appendEntry({ user, entry, category = '', date, time, cycle }) {
  const tab = await ensureUserTab(user);
  const now = new Date();
  const row = [
    date || now.toISOString().slice(0, 10),
    time || now.toTimeString().slice(0, 5),
    entry,
    category,
    cycle || cycleLabel(now),
  ];
  await api().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${tab}'!A:E`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  logger.info(`[pa] Entry saved for "${tab}"`);
  return { user: tab, row };
}

// Read all entries for a user (optionally filter by cycle).
async function getEntries(userName, cycle) {
  const tab = safeTabName(userName);
  const tabs = await listTabs();
  if (!tabs.includes(tab)) return [];
  const res = await api().spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${tab}'!A2:E` });
  let rows = (res.data.values || []).map((r, i) => ({
    rowNumber: i + 2,
    date: r[0] || '', time: r[1] || '', entry: r[2] || '', category: r[3] || '', cycle: r[4] || '',
  })).filter(r => r.entry);
  if (cycle) rows = rows.filter(r => r.cycle === cycle);
  return rows;
}

async function listCycles(userName) {
  const rows = await getEntries(userName);
  return [...new Set(rows.map(r => r.cycle).filter(Boolean))];
}

module.exports = {
  SHEET_ID, HEADERS, cycleLabel, safeTabName,
  listUsers, ensureUserTab, appendEntry, getEntries, listCycles,
  getAccount, createAccount,
};
