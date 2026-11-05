// Read the Playbook spreadsheet (both tabs) using the project's Google OAuth token.
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, '..', 'credentials', 'google-token.json');
const SHEET_ID = '1OpCBtswRaKIEzQbjzSLkNiZYv_3Fhn0A';

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

  // 1) List tabs
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const tabs = meta.data.sheets.map(s => s.properties.title);
  console.log('TITLE:', meta.data.properties.title);
  console.log('TABS:', JSON.stringify(tabs));

  // 2) Dump each tab's values
  const out = {};
  for (const tab of tabs) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tab}'`,
    });
    out[tab] = res.data.values || [];
  }
  fs.writeFileSync(path.join(__dirname, '..', 'output', 'playbook_dump.json'), JSON.stringify(out, null, 2));
  for (const tab of tabs) {
    console.log(`\n===== TAB: ${tab} (${out[tab].length} rows) =====`);
    out[tab].slice(0, 60).forEach((row, i) => {
      const line = row.map(c => (c || '').toString().replace(/\s+/g, ' ').trim()).join(' | ');
      if (line.trim()) console.log(`${i + 1}: ${line}`);
    });
  }
  console.log('\nFull dump: output/playbook_dump.json');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
