// Sends Zia ul Hasnain's employment verification emails, CC hiring@taleemabad.com.
// node send.js --test   -> all 4 to tahir.saleem only (no CC)
// node send.js --send   -> real recipients, CC hiring@taleemabad.com
const fs = require('fs');
const path = require('path');

const CC = 'hiring@taleemabad.com';
const SUBJECT = 'Employment Verification Request – Zia ul Hasnain';
const RECIPIENTS = [
  { key: 'cities_for_children', to: 'Madeeha Ansari <madeeha@citiesforchildren.co>' },
  { key: 'mehd', to: 'Malik Muhammad Faisal <faisalmalik@mehdfoundation.org>' },
  { key: 'suno_news', to: 'Muhammad Kamran Khan <kamran.khan@sunotv.com>' },
  { key: 'zab_fm', to: 'Wajid Zulqarnain <hod.media@szabist-isb.edu.pk>' },
];

const mode = process.argv[2];
if (mode !== '--test' && mode !== '--send') { console.log('Usage: node send.js --test | --send'); process.exit(1); }

const c = JSON.parse(fs.readFileSync('C:/Raftar/ai-agent-starter/credentials/google-oauth-client.json')).installed;
const t = JSON.parse(fs.readFileSync('C:/Raftar/ai-agent-starter/credentials/google-token.json'));
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
(async () => {
  const tr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }) });
  const H = { Authorization: 'Bearer ' + (await tr.json()).access_token, 'Content-Type': 'application/json' };
  const me = (await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: H })).json()).emailAddress;
  if (me !== 'tahir.saleem@niete.edu.pk') throw new Error('Wrong account: ' + me);
  for (const r of RECIPIENTS) {
    const html = fs.readFileSync(path.join(__dirname, `preview_${r.key}.html`), 'utf8');
    const headers = mode === '--send'
      ? [`To: ${r.to}`, `Cc: ${CC}`, `Subject: =?UTF-8?B?${b64(SUBJECT)}?=`]
      : [`To: ${me}`, `Subject: =?UTF-8?B?${b64(`[TEST → ${r.to} | CC ${CC}] ${SUBJECT}`)}?=`];
    const mime = [`From: Tahir Saleem <${me}>`, ...headers, 'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html)].join('\r\n');
    const res = await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      { method: 'POST', headers: H, body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url') }) })).json();
    console.log(res.id ? `SENT ${r.key} -> ${mode === '--send' ? r.to + ' (cc ' + CC + ')' : me} [${res.id}]` : `FAILED ${r.key}: ${JSON.stringify(res)}`);
  }
})();
