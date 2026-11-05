// Follow-ups prepared 27 Oct 2026: second reminders (Zia's 3 orgs + Hina's school) and Naima's City School verification.
// node followups.js            -> write preview HTML only (default, nothing sent)
// node followups.js --send     -> send all (replies stay in the same thread, CC hiring@)
const fs = require('fs');
const path = require('path');

const CC = 'hiring@taleemabad.com';
const RESPONSE_DATE = 'Monday, 2 November 2026';

const REMINDERS = [
  { key: 'mehd', thread: '1a12fb0399941cdb', candidate: 'Zia ul Hasnain', name: 'Malik Muhammad Faisal', to: 'Malik Muhammad Faisal <faisalmalik@mehdfoundation.org>', sentOn: '12 October' },
  { key: 'suno', thread: '1a12fb03d2c79970', candidate: 'Zia ul Hasnain', name: 'Muhammad Kamran Khan', to: 'Muhammad Kamran Khan <kamran.khan@sunotv.com>', sentOn: '12 October' },
  { key: 'zab_fm', thread: '1a12fb03f98801c4', candidate: 'Zia ul Hasnain', name: 'Dr. Wajid Zulqarnain', to: 'Wajid Zulqarnain <hod.media@szabist-isb.edu.pk>', sentOn: '12 October' },
  { key: 'radiant', thread: '1a11a6c4ee300072', candidate: 'Hina Fatima Jafri', name: 'Ch. Mukhtar Ahmed Warraich', to: 'Ch. Mukhtar Ahmed Warraich <radsscl@gmail.com>', sentOn: '14 October' },
];

const reminderHtml = r => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Second Reminder</title></head>
<body style="margin:0; padding:0; background-color:#ffffff;">
<div style="max-width:600px; padding:8px 4px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#2b2f33;">
<p style="margin:0 0 14px;">Dear ${r.name},</p>
<p style="margin:0 0 14px;">I hope this finds you well. I am writing once more regarding my email of ${r.sentOn} about the employment verification of <strong>${r.candidate}</strong>, as we have not yet been able to close this step.</p>
<p style="margin:0 0 14px;">A brief reply confirming the period of association and the designation would be sufficient. If you are not the right person to confirm this, we would be grateful if you could point us to the relevant HR contact.</p>
<p style="margin:0 0 14px;">We would appreciate a response by <strong>${RESPONSE_DATE}</strong>, if possible. Thank you for your time and support.</p>
<p style="margin:0;">Warm regards,</p>
<p style="margin:0; font-weight:bold; color:#1f4e8c;">Tahir Saleem</p>
<p style="margin:0; color:#5a6470;">People &amp; Culture | Taleemabad (NIETE)</p>
</div></body></html>`;

// Naima Javed -> The City School, Regional Office North HR (address from the experience certificate she submitted, official csn.edu.pk domain).
// Two tenures in one email; E-11 designation asked openly because her CV says "Lecturer" and the appointment letter says "Teacher Pre Junior".
const CITY_SCHOOL = {
  key: 'naima_city_school', to: 'Sadia Rafi <csnnro5@csn.edu.pk>', name: 'Sadia Rafi',
  subject: 'Employment Verification Request – Naima Javed',
};
const citySchoolHtml = () => {
  const t = fs.readFileSync('C:/Raftar/verification/employment_verification_email.html', 'utf8');
  const rows = `<strong style="display:inline-block; width:110px; color:#5a6470;">Candidate:</strong> Naima Javed<br>
                    <strong style="display:inline-block; width:110px; color:#5a6470;">Campus 1:</strong> Gulrez Campus, Rawalpindi &ndash; Teacher, February 2012 &ndash; August 2014<br>
                    <strong style="display:inline-block; width:110px; color:#5a6470;">Campus 2:</strong> E-11 Campus, Islamabad &ndash; March 2021 &ndash; 2022`;
  return t
    .replace(/\[Recipient Name\]/g, CITY_SCHOOL.name)
    .replace(/\[Response Date\]/g, RESPONSE_DATE)
    .replace(/\[Candidate Name\]/g, 'Naima Javed')
    .replace(/has listed your organization in their CV and has shared your contact details, with their consent, for this purpose/,
      'has listed <strong>The City School</strong> (two campuses) in their CV and has consented to this verification')
    .replace(/<strong[^>]*>Candidate:<\/strong>[\s\S]*?\[End Date\]/, rows)
    .replace('Whether the designation mentioned is accurate.', 'The designation held at each campus (for the E-11 Campus, please confirm the exact title, e.g. Teacher or Lecturer).');
};

const mode = process.argv[2] || '--preview';
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean); // e.g. --only=mehd,radiant
const b64 = s => Buffer.from(s, 'utf8').toString('base64');

(async () => {
  const items = [
    ...REMINDERS.map(r => ({ ...r, html: reminderHtml(r) })),
    { ...CITY_SCHOOL, html: citySchoolHtml() },
  ].filter(it => !ONLY.length || ONLY.includes(it.key));
  for (const it of items) fs.writeFileSync(path.join(__dirname, `preview_${it.key}.html`), it.html);
  if (mode !== '--send') { items.forEach(it => console.log(`PREVIEW preview_${it.key}.html -> ${it.to}`)); return; }

  const c = JSON.parse(fs.readFileSync('C:/Raftar/ai-agent-starter/credentials/google-oauth-client.json')).installed;
  const t = JSON.parse(fs.readFileSync('C:/Raftar/ai-agent-starter/credentials/google-token.json'));
  const tr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }) });
  const H = { Authorization: 'Bearer ' + (await tr.json()).access_token, 'Content-Type': 'application/json' };
  const me = (await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: H })).json()).emailAddress;
  if (me !== 'tahir.saleem@niete.edu.pk') throw new Error('Wrong account: ' + me);

  for (const it of items) {
    const head = [`From: Tahir Saleem <${me}>`, `To: ${it.to}`, `Cc: ${CC}`];
    let threadId;
    if (it.thread) {
      const th = await (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${it.thread}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject`, { headers: H })).json();
      const hdr = Object.fromEntries(th.messages[th.messages.length - 1].payload.headers.map(x => [x.name.toLowerCase(), x.value]));
      const subj = th.messages[0].payload.headers.find(x => x.name === 'Subject').value;
      head.push(`Subject: =?UTF-8?B?${b64(subj.startsWith('Re:') ? subj : 'Re: ' + subj)}?=`,
        `In-Reply-To: ${hdr['message-id']}`, `References: ${[hdr['references'], hdr['message-id']].filter(Boolean).join(' ')}`);
      threadId = it.thread;
    } else {
      head.push(`Subject: =?UTF-8?B?${b64(it.subject)}?=`);
    }
    const mime = [...head, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(it.html)].join('\r\n');
    const res = await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      { method: 'POST', headers: H, body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url'), ...(threadId && { threadId }) }) })).json();
    console.log(res.id ? `SENT -> ${it.to} (cc ${CC}) [${res.id}]` : `FAILED ${it.to}: ${JSON.stringify(res)}`);
  }
})();
