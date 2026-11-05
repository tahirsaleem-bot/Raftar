// Follow-up reminders for verification emails sent on 12 Oct 2026.
// Sends a short reminder (reply in the same thread, CC hiring@) ONLY where the organization has not replied yet.
// node reminders.js --check    -> report reply status only
// node reminders.js --preview  -> write preview HTML for pending ones
// node reminders.js --send     -> send reminders for pending ones
const fs = require('fs');
const path = require('path');

const CC = 'hiring@taleemabad.com';
const SENT = [
  { msg: '1a12fb0366d863c4', candidate: 'Zia ul Hasnain', name: 'Madeeha Ansari', to: 'Madeeha Ansari <madeeha@citiesforchildren.co>' },
  { msg: '1a12fb0399941cdb', candidate: 'Zia ul Hasnain', name: 'Malik Muhammad Faisal', to: 'Malik Muhammad Faisal <faisalmalik@mehdfoundation.org>' },
  { msg: '1a12fb03d2c79970', candidate: 'Zia ul Hasnain', name: 'Muhammad Kamran Khan', to: 'Muhammad Kamran Khan <kamran.khan@sunotv.com>' },
  { msg: '1a12fb03f98801c4', candidate: 'Zia ul Hasnain', name: 'Dr. Wajid Zulqarnain', to: 'Wajid Zulqarnain <hod.media@szabist-isb.edu.pk>' },
  { msg: '1a12fb611f568804', candidate: 'Noor ul Ain Rana', name: 'Wajeeha Abbasi', to: 'Teach For Pakistan HR <hr@iteachforpakistan.org>' },
];

const reminderHtml = r => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Gentle Reminder</title></head>
<body style="margin:0; padding:0; background-color:#ffffff;">
<div style="max-width:600px; padding:8px 4px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#2b2f33;">
<p style="margin:0 0 14px;">Dear ${r.name},</p>
<p style="margin:0 0 14px;">I hope you are doing well. This is a gentle follow-up on my email of 12 October regarding the employment verification of <strong>${r.candidate}</strong>.</p>
<p style="margin:0 0 14px;">We would be grateful if you could confirm the details at your earliest convenience. A brief reply to this email would be sufficient.</p>
<p style="margin:0 0 14px;">Thank you for your time and support.</p>
<p style="margin:0;">Warm regards,</p>
<p style="margin:0; font-weight:bold; color:#1f4e8c;">Tahir Saleem</p>
<p style="margin:0; color:#5a6470;">People &amp; Culture | Taleemabad (NIETE)</p>
</div></body></html>`;

const mode = process.argv[2] || '--check';
const c = JSON.parse(fs.readFileSync('C:/Raftar/ai-agent-starter/credentials/google-oauth-client.json')).installed;
const t = JSON.parse(fs.readFileSync('C:/Raftar/ai-agent-starter/credentials/google-token.json'));
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const log = s => { console.log(s); fs.appendFileSync(path.join(__dirname, 'reminders.log'), `${new Date().toISOString()} ${s}\n`); };

(async () => {
  const tr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }) });
  const H = { Authorization: 'Bearer ' + (await tr.json()).access_token, 'Content-Type': 'application/json' };
  const me = (await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: H })).json()).emailAddress;
  if (me !== 'tahir.saleem@niete.edu.pk') throw new Error('Wrong account: ' + me);

  for (const r of SENT) {
    const orig = await (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${r.msg}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=Subject`, { headers: H })).json();
    const oh = Object.fromEntries(orig.payload.headers.map(x => [x.name.toLowerCase(), x.value]));
    const thread = await (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${orig.threadId}?format=metadata&metadataHeaders=From`, { headers: H })).json();
    const froms = thread.messages.map(m => (m.payload.headers.find(h => h.name === 'From') || {}).value || '');
    const bounced = froms.some(f => /mailer-daemon|postmaster/i.test(f));
    const replied = froms.some(f => !f.includes(me) && !/mailer-daemon|postmaster/i.test(f));
    const reminded = thread.messages.length > 1 && !replied && !bounced;
    const status = bounced ? 'BOUNCED' : replied ? 'REPLIED' : reminded ? 'ALREADY REMINDED' : 'PENDING';
    if (mode === '--check' || status !== 'PENDING') { log(`${status.padEnd(16)} ${r.candidate} -> ${r.to}`); continue; }

    const html = reminderHtml(r);
    if (mode === '--preview') { const f = path.join(__dirname, `reminder_preview_${r.msg}.html`); fs.writeFileSync(f, html); log(`PREVIEW ${r.to} -> ${f}`); continue; }

    const subject = /^re:/i.test(oh.subject) ? oh.subject : 'Re: ' + oh.subject;
    const mime = [`From: Tahir Saleem <${me}>`, `To: ${r.to}`, `Cc: ${CC}`, `Subject: =?UTF-8?B?${b64(subject)}?=`,
      `In-Reply-To: ${oh['message-id']}`, `References: ${oh['message-id']}`, 'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html)].join('\r\n');
    const res = await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      { method: 'POST', headers: H, body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url'), threadId: orig.threadId }) })).json();
    log(res.id ? `REMINDER SENT    ${r.candidate} -> ${r.to} (cc ${CC}) [${res.id}]` : `FAILED ${r.to}: ${JSON.stringify(res)}`);
  }
})();
