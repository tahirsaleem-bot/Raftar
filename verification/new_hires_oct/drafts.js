// New joiners from the Employee Data Form (Aliya Fehmi, Adnan Ali Abid, Sibgha Shireen), prepared 27 Oct 2026.
// Aliya + Sibgha: contact-details request (no official HR email found for their schools).
// Adnan: direct verification to Teach For Pakistan HR (official, already responsive on Noor's case).
// node drafts.js                      -> write preview HTML only (default, nothing sent)
// node drafts.js --send [--only=a,b]  -> send (CC hiring@)
const fs = require('fs');
const path = require('path');

const CC = 'hiring@taleemabad.com';
const CONTACT_BY = 'Friday, 30 October 2026';
const RESPONSE_DATE = 'Monday, 2 November 2026';


// Same branded shell as employment_verification_email.html (blue header, details card, signature, footer).
const F = 'font-family:Arial, Helvetica, sans-serif;';
const card = inner => `<tr><td style="padding:0 32px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f9fc; border-left:4px solid #1f4e8c; border-radius:4px;">
  <tr><td style="padding:14px 18px; ${F} font-size:14px; line-height:1.8; color:#2b2f33;">${inner}</td></tr></table></td></tr>`;
const text = inner => `<tr><td style="padding:12px 32px 4px; ${F} font-size:15px; line-height:1.6; color:#2b2f33;">${inner}</td></tr>`;
const contactRequest = (first, orgs, extra = '') => `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Experience Verification</title></head>
<body style="margin:0; padding:0; background-color:#f4f6f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:8px; overflow:hidden; border:1px solid #e3e7eb;">
  <tr><td style="background-color:#1f4e8c; padding:20px 32px;">
    <p style="margin:0; ${F} font-size:13px; letter-spacing:1px; text-transform:uppercase; color:#cfe0f5;">Taleemabad (NIETE) &middot; People &amp; Culture</p>
    <h1 style="margin:6px 0 0; ${F} font-size:20px; font-weight:bold; color:#ffffff;">Experience Verification &ndash; Contact Details</h1>
  </td></tr>
  <tr><td style="padding:28px 32px 4px; ${F} font-size:15px; line-height:1.6; color:#2b2f33;">
    <p style="margin:0 0 16px;">Dear ${first},</p>
    <p style="margin:0 0 12px;">As part of our experience verification process, we kindly request you to share the contact details of the relevant team members (preferably HR or your line manager) at the following organization${orgs.length > 1 ? 's' : ''} listed in your CV:</p>
  </td></tr>
  ${card(orgs.map(o => `&bull; ${o}`).join('<br>'))}
  ${extra ? text(extra) : ''}
  ${text(`<p style="margin:0 0 8px;">Please share the details in the following format for each organization, by <strong>${CONTACT_BY}</strong>:</p>`)}
  ${card(`<strong style="color:#5a6470;">Organization:</strong> Name<br><strong style="color:#5a6470;">Your designation and dates:</strong> Designation, Month/Year &ndash; Month/Year<br><strong style="color:#5a6470;">Contact person:</strong> Name, Designation<br><strong style="color:#5a6470;">Official work email:</strong> Email<br><strong style="color:#5a6470;">Phone:</strong> Number`)}
  ${text(`<p style="margin:0 0 16px;">If you have experience letters or certificates for these roles, please attach them as well. Thank you for your cooperation.</p>`)}
  <tr><td style="padding:8px 32px 28px; ${F} font-size:15px; line-height:1.5; color:#2b2f33;">
    <p style="margin:0 0 4px;">Warm regards,</p>
    <p style="margin:0; font-weight:bold; color:#1f4e8c;">Tahir Saleem</p>
    <p style="margin:0; font-size:14px; color:#5a6470;">People &amp; Culture | Taleemabad (NIETE)</p>
    <p style="margin:0; font-size:14px;"><a href="mailto:tahir.saleem@niete.edu.pk" style="color:#1f4e8c; text-decoration:none;">tahir.saleem@niete.edu.pk</a></p>
  </td></tr>
  <tr><td style="background-color:#f4f6f8; padding:14px 32px; ${F} font-size:12px; line-height:1.5; color:#8a939c; border-top:1px solid #e3e7eb;">
    This email and any information exchanged are confidential and intended solely for employment verification purposes.
  </td></tr>
</table></td></tr></table></body></html>`;

const tfpHtml = () => {
  const t = fs.readFileSync('C:/Raftar/verification/employment_verification_email.html', 'utf8');
  const rows = `<strong style="display:inline-block; width:110px; color:#5a6470;">Candidate:</strong> Adnan Ali Abid<br>
                    <strong style="display:inline-block; width:110px; color:#5a6470;">Role 1:</strong> Fellow &amp; Science Teacher (Islamabad Model College for Boys, Barakahu) &ndash; 2023 &ndash; 2025<br>
                    <strong style="display:inline-block; width:110px; color:#5a6470;">Role 2:</strong> Senior Associate, Operations &ndash; June 2025 &ndash; October 2026`;
  return t
    .replace(/\[Recipient Name\]/g, 'Wajeeha Abbasi')
    .replace(/\[Response Date\]/g, RESPONSE_DATE)
    .replace(/\[Candidate Name\]/g, 'Adnan Ali Abid')
    .replace(/has listed your organization in their CV and has shared your contact details, with their consent, for this purpose/,
      'has listed <strong>Teach For Pakistan</strong> in their CV and has consented to this verification')
    .replace(/<strong[^>]*>Candidate:<\/strong>[\s\S]*?\[End Date\]/, rows)
    .replace('Whether the candidate was associated with your organization during the period stated above; and',
      'The exact dates of association for each role stated above; and')
    .replace('Whether the designation mentioned is accurate.', 'Whether the designations mentioned are accurate.');
};

const ITEMS = [
  { key: 'aliya_contacts', to: 'Aliya Fehmi <aliya.fehmi@niete.edu.pk>',
    subject: 'Experience Verification – Contact Details Required | Aliya Fehmi',
    html: contactRequest('Aliya', [
      'The City School, Jinnah Campus, Hyderabad (O Levels English Teacher, Jan 2024 – May 2025)',
      'The Educators, Rawalpindi Campus (Campus Incharge, Mar 2022 – Mar 2023)',
      'Elysian School, Hunza Campus (Principal, Mar 2018 – Dec 2021)',
    ], `<p style="margin:0 0 4px;">Thank you for the experience certificate from the College of Teacher Education (Kashmir Education Foundation); no contact is needed for that role.</p>`) },
  { key: 'sibgha_contacts', to: 'Sibgha Shireen <sibgha@niete.edu.pk>',
    subject: 'Experience Verification – Contact Details Required | Sibgha Shireen',
    html: contactRequest('Sibgha', [
      'Angels International College (IB World School), Faisalabad (PYP Teacher)',
    ], `<p style="margin:0 0 4px;">Thank you for the experience certificate. We would only need an official HR email address for Angels International College, as we could not find one on their website. Kindly also confirm your start date there: your CV mentions June 2024, while the certificate states 1 August 2024.</p>`) },
  { key: 'adnan_tfp', to: 'Teach For Pakistan HR <hr@iteachforpakistan.org>',
    subject: 'Employment Verification Request – Adnan Ali Abid', html: tfpHtml() },
];

const mode = process.argv[2] || '--preview';
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const b64 = s => Buffer.from(s, 'utf8').toString('base64');

(async () => {
  const items = ITEMS.filter(it => !ONLY.length || ONLY.includes(it.key));
  for (const it of items) fs.writeFileSync(path.join(__dirname, `preview_${it.key}.html`), it.html);
  if (mode !== '--send') { items.forEach(it => console.log(`PREVIEW preview_${it.key}.html -> ${it.to} | ${it.subject}`)); return; }

  const c = JSON.parse(fs.readFileSync('C:/Raftar/ai-agent-starter/credentials/google-oauth-client.json')).installed;
  const t = JSON.parse(fs.readFileSync('C:/Raftar/ai-agent-starter/credentials/google-token.json'));
  const tr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }) });
  const H = { Authorization: 'Bearer ' + (await tr.json()).access_token, 'Content-Type': 'application/json' };
  const me = (await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: H })).json()).emailAddress;
  if (me !== 'tahir.saleem@niete.edu.pk') throw new Error('Wrong account: ' + me);
  for (const it of items) {
    const mime = [`From: Tahir Saleem <${me}>`, `To: ${it.to}`, `Cc: ${CC}`, `Subject: =?UTF-8?B?${b64(it.subject)}?=`,
      'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(it.html)].join('\r\n');
    const res = await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      { method: 'POST', headers: H, body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url') }) })).json();
    console.log(res.id ? `SENT -> ${it.to} (cc ${CC}) thread ${res.threadId} [${res.id}]` : `FAILED ${it.to}: ${JSON.stringify(res)}`);
  }
})();
