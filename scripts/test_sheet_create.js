// Validate: can we (a) create a native Google Sheet and (b) auto-add a per-user tab
// with the current OAuth token (scopes: spreadsheets + drive.readonly)?
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, '..', 'credentials', 'google-token.json');

function auth() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const { client_id, client_secret } = creds.installed || creds.web;
  const a = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  a.setCredentials(token);
  return a;
}

(async () => {
  const sheets = google.sheets({ version: 'v4', auth: auth() });

  // (a) create a native spreadsheet
  console.log('Creating native spreadsheet...');
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: 'People Analyzer Logbook (TEST)' },
      sheets: [{ properties: { title: 'README' } }],
    },
  });
  const id = created.data.spreadsheetId;
  console.log('CREATED OK. id =', id);
  console.log('URL =', created.data.spreadsheetUrl);

  // (b) add a per-user tab via batchUpdate
  console.log('Adding a per-user tab "Tahir Saleem"...');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: { requests: [{ addSheet: { properties: { title: 'Tahir Saleem' } } }] },
  });
  console.log('TAB ADDED OK.');

  // (c) write headers + a row
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `'Tahir Saleem'!A1:E1`,
    valueInputOption: 'RAW',
    requestBody: { values: [['Date', 'Time', 'Entry', 'Category', 'Cycle']] },
  });
  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `'Tahir Saleem'!A:E`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['2026-06-23', '14:30', 'Test entry from setup script', 'Test', 'Cycle 1']] },
  });
  console.log('WRITE OK. Everything works with current scopes.');
  console.log('\nTEST_SHEET_ID=' + id);
})().catch(e => { console.error('ERROR:', e.message); if (e.errors) console.error(JSON.stringify(e.errors)); process.exit(1); });
