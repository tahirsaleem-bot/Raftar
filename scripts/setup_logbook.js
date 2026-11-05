// Repurpose the created sheet as the real logbook: rename, set up README, remove test tab.
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, '..', 'credentials', 'google-token.json');
const ENV_PATH = path.join(__dirname, '..', '.env');
const SHEET_ID = process.argv[2] || '1kLVyCcuJzvVpljM74xK8uVZGA-FmQbx1fS030_8zAME';

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
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const byTitle = {};
  meta.data.sheets.forEach(s => { byTitle[s.properties.title] = s.properties.sheetId; });

  const requests = [];
  // Rename spreadsheet
  requests.push({ updateSpreadsheetProperties: { properties: { title: 'People Analyzer Logbook' }, fields: 'title' } });
  // Remove the test tab if present
  if (byTitle['Tahir Saleem'] != null) {
    requests.push({ deleteSheet: { sheetId: byTitle['Tahir Saleem'] } });
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });

  // Put a short README in the README tab
  if (byTitle['README'] != null) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'README'!A1:A6`,
      valueInputOption: 'RAW',
      requestBody: { values: [
        ['People Analyzer Logbook'],
        ['Voice activity log for the People Analyzer (every 4 months).'],
        ['Each user gets their own tab, created automatically on their first entry.'],
        ['Columns: Date | Time | Entry (English) | Category | Cycle'],
        ['Do not edit this README tab.'],
        ['Created by Raftar.'],
      ] },
    });
  }
  console.log('Logbook ready:', 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit');

  // Save ID to .env (replace if exists)
  let env = fs.readFileSync(ENV_PATH, 'utf8');
  if (/^PA_LOGBOOK_SHEET_ID=/m.test(env)) {
    env = env.replace(/^PA_LOGBOOK_SHEET_ID=.*$/m, 'PA_LOGBOOK_SHEET_ID=' + SHEET_ID);
  } else {
    env += `\n# ─── People Analyzer Logbook ───\nPA_LOGBOOK_SHEET_ID=${SHEET_ID}\n`;
  }
  fs.writeFileSync(ENV_PATH, env);
  console.log('Saved PA_LOGBOOK_SHEET_ID to .env');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
