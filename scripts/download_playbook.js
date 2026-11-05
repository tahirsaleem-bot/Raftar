// Download the Playbook .xlsx via Drive (readonly) to output/playbook.xlsx
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, '..', 'credentials', 'google-token.json');
const SHEET_ID = '1OpCBtswRaKIEzQbjzSLkNiZYv_3Fhn0A';
const OUT = path.join(__dirname, '..', 'output', 'playbook.xlsx');

function auth() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const { client_id, client_secret } = creds.installed || creds.web;
  const a = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  a.setCredentials(token);
  return a;
}

(async () => {
  const drive = google.drive({ version: 'v3', auth: auth() });
  const meta = await drive.files.get({ fileId: SHEET_ID, fields: 'name,mimeType' });
  console.log('NAME:', meta.data.name, '| MIME:', meta.data.mimeType);

  const res = await drive.files.get(
    { fileId: SHEET_ID, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  fs.writeFileSync(OUT, Buffer.from(res.data));
  console.log('Downloaded to', OUT, '(', fs.statSync(OUT).size, 'bytes )');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
