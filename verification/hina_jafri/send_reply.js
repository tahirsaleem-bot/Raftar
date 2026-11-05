// Sends the verification email to Radiant Secondary School as a reply in the 8 Oct thread, CC hiring@.
const fs = require('fs');
const path = require('path');

const THREAD_ID = '1a11a6c4ee300072';
const LAST_MSG_ID = '1a11a6e128fb9936'; // Tahir's 8 Oct email to Radiant
const TO = 'Ch. Mukhtar Ahmed Warraich <radsscl@gmail.com>';
const CC = 'hiring@taleemabad.com';
const SUBJECT = 'Re: Experience Verification – Hina Fatima Jafri';

const c = JSON.parse(fs.readFileSync('C:/Raftar/ai-agent-starter/credentials/google-oauth-client.json')).installed;
const t = JSON.parse(fs.readFileSync('C:/Raftar/ai-agent-starter/credentials/google-token.json'));
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
(async () => {
  const tr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }) });
  const H = { Authorization: 'Bearer ' + (await tr.json()).access_token, 'Content-Type': 'application/json' };
  const me = (await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: H })).json()).emailAddress;
  if (me !== 'tahir.saleem@niete.edu.pk') throw new Error('Wrong account: ' + me);

  const last = await (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${LAST_MSG_ID}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`, { headers: H })).json();
  const hdr = Object.fromEntries(last.payload.headers.map(x => [x.name.toLowerCase(), x.value]));
  const msgId = hdr['message-id'];
  const refs = [hdr['references'], msgId].filter(Boolean).join(' ');

  const html = fs.readFileSync(path.join(__dirname, 'preview_radiant.html'), 'utf8');
  const mime = [`From: Tahir Saleem <${me}>`, `To: ${TO}`, `Cc: ${CC}`, `Subject: =?UTF-8?B?${b64(SUBJECT)}?=`,
    `In-Reply-To: ${msgId}`, `References: ${refs}`, 'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html)].join('\r\n');
  const res = await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    { method: 'POST', headers: H, body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url'), threadId: THREAD_ID }) })).json();
  console.log(res.id ? `SENT -> ${TO} (cc ${CC}) thread ${res.threadId} [${res.id}]` : `FAILED: ${JSON.stringify(res)}`);
})();
