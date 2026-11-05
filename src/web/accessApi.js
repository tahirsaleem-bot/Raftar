// ─── Dashboard access API (used by the /pa Users page) ───────────────────────
// Tahir manages who may open the dashboard from the pa-app's Users page
// (super admin only). The pa-app calls these routes server-to-server with the
// shared key DASHBOARD_ADMIN_KEY (header x-admin-key); browsers never call them.
//   GET    /api/dashboard-users              → accounts
//   POST   /api/dashboard-users  {email, invitedBy}  → create + email a temp password
//   DELETE /api/dashboard-users/:email       → revoke at once
// The invite goes out from the Gmail account in credentials/google-token.json
// (tahir.saleem@niete.edu.pk, gmail.send scope).
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const auth = require('./auth');
const logger = require('../logger');

const DASHBOARD_URL = process.env.DASHBOARD_PUBLIC_URL || 'https://meter-reading-production-2d7f.up.railway.app/dashboard';
const EXIT_URL = process.env.EXIT_PUBLIC_URL || 'https://exit-interview-agent-production.up.railway.app/';
const appOf = req => (auth.APPS.includes(String(req.query.app || (req.body && req.body.app) || '')) ? String(req.query.app || req.body.app) : 'meter');
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i;

function keyOk(req) {
  const want = process.env.DASHBOARD_ADMIN_KEY;
  const got = String(req.get('x-admin-key') || '');
  if (!want || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

function gmail() {
  const dir = path.join(__dirname, '..', '..', 'credentials');
  const creds = JSON.parse(fs.readFileSync(path.join(dir, 'google-oauth-client.json')));
  const token = JSON.parse(fs.readFileSync(path.join(dir, 'google-token.json')));
  const { client_id, client_secret } = creds.installed || creds.web;
  const o = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  o.setCredentials(token);
  return google.gmail({ version: 'v1', auth: o });
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ─── Invite email layout ─────────────────────────────────────────────────────
// Tables + inline styles only, so Gmail, Outlook and phone mail apps all render
// it the same: navy header with the Raftar logo, a credentials card, one big
// sign-in button, numbered steps, and a quiet footer. 560px wide, fluid on phones.
const LOGO_URL = DASHBOARD_URL.replace(/\/dashboard$/, '') + '/brand-logo';
const FONT = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
function inviteHtml({ preheader, appName, tagline, who, intro, rows, ctaLabel, ctaUrl, steps, note, contact }) {
  const row = ([k, v, mono], i) => { const line = i < rows.length - 1 ? "border-bottom:1px solid #E2E8F0;" : ""; return `<tr>
<td style="${FONT}padding:12px 0;${line}font-size:13px;color:#64748B;width:34%;vertical-align:top;padding-right:12px">${k}</td>
<td style="${mono ? "font-family:Consolas,'Courier New',monospace;font-size:18px;letter-spacing:2px;font-weight:700;color:#0E1838" : FONT + 'font-size:15px;color:#0F172A;font-weight:600'};padding:12px 0;${line}vertical-align:top;word-break:break-all">${v}</td></tr>`; };
  const step = (s, i) => `<tr>
<td width="34" style="vertical-align:top;padding:0 0 12px 0"><div style="${FONT}width:24px;height:24px;line-height:24px;border-radius:12px;background:#E0F2F1;color:#0F766E;font-size:13px;font-weight:700;text-align:center">${i + 1}</div></td>
<td style="${FONT}font-size:15px;line-height:1.5;color:#334155;padding:2px 0 12px 0">${s}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(appName)}</title></head>
<body style="margin:0;padding:0;background:#EEF2F7">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E2E8F0">
<tr><td style="background:#0E1838;padding:22px 28px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;padding-right:14px"><img src="${esc(LOGO_URL)}" width="44" height="44" alt="Raftar" style="display:block;border-radius:22px;border:2px solid #2DD4BF"></td>
<td style="vertical-align:middle"><div style="${FONT}font-size:18px;font-weight:700;color:#FFFFFF">${esc(appName)}</div><div style="${FONT}font-size:13px;color:#94A3B8">${esc(tagline)}</div></td>
</tr></table></td></tr>
<tr><td style="padding:30px 28px 8px 28px">
<div style="${FONT}font-size:22px;font-weight:700;color:#0F172A;line-height:1.3">You've been given access</div>
<p style="${FONT}font-size:15px;line-height:1.6;color:#334155;margin:12px 0 0 0">Hello,<br><br><b>${esc(who)}</b> ${intro}</p>
</td></tr>
<tr><td style="padding:18px 28px 0 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px"><tr><td style="padding:6px 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(row).join('')}</table>
</td></tr></table></td></tr>
<tr><td align="center" style="padding:24px 28px 6px 28px">
<a href="${esc(ctaUrl)}" style="${FONT}display:inline-block;background:#0F766E;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:14px 34px;border-radius:10px">${esc(ctaLabel)}</a>
<div style="${FONT}font-size:12px;color:#94A3B8;margin-top:10px;word-break:break-all">${esc(ctaUrl)}</div>
</td></tr>
${steps && steps.length ? `<tr><td style="padding:22px 28px 0 28px">
<div style="${FONT}font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748B;margin-bottom:12px">Getting started</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${steps.map(step).join('')}</table></td></tr>` : ''}
<tr><td style="padding:10px 28px 26px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8E6;border-left:3px solid #F59E0B;border-radius:6px"><tr><td style="${FONT}padding:12px 14px;font-size:13px;line-height:1.55;color:#78350F">${note}</td></tr></table>
</td></tr>
<tr><td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:16px 28px">
<div style="${FONT}font-size:12px;line-height:1.6;color:#94A3B8">If you did not expect this email, you can ignore it or contact ${esc(contact)}.</div>
<div style="${FONT}font-size:12px;color:#64748B;font-weight:600;margin-top:6px">Sent by Raftar</div>
</td></tr>
</table></td></tr></table></body></html>`;
}

// English, approved by Tahir 2026-10-26 (recipients are staff, not drivers);
// still signed "Sent by Raftar" (CLAUDE.md rule 4)
function inviteEmail(email, password, invitedBy) {
  const who = invitedBy || 'Your administrator';
  const text = `Hello,

${who} has given you access to the Raftar Fleet Operations dashboard, where you can see daily meter readings, monthly kilometres per hub, and the monthly invoice estimate for the Islamabad and Rawalpindi fleets.

Dashboard: ${DASHBOARD_URL}
Email: ${email}
Temporary password: ${password}

Getting started
1. Open the dashboard link and sign in with the email and temporary password above.
2. Right after you sign in, you will be asked to choose your own password (at least 6 characters).

Please keep your password private and do not share it with anyone. If you did not expect this email, you can ignore it or contact ${invitedBy || 'your administrator'}.

Sent by Raftar`;
  const html = inviteHtml({
    preheader: 'Your sign-in details for the Raftar Fleet Operations dashboard',
    appName: 'Fleet Operations', tagline: 'Raftar · Meter readings & invoices', who,
    intro: 'has given you access to the <b>Raftar Fleet Operations dashboard</b>, where you can see daily meter readings, monthly kilometres per hub, and the monthly invoice estimate for the Islamabad and Rawalpindi fleets.',
    rows: [['Email', esc(email)], ['Temporary password', esc(password), true]],
    ctaLabel: 'Sign in to the dashboard', ctaUrl: DASHBOARD_URL,
    steps: ['Click <b>Sign in to the dashboard</b> and enter the email and temporary password above.',
      'Right after you sign in, you will be asked to <b>choose your own password</b> (at least 6 characters).'],
    note: 'Please keep your password private and do not share it with anyone.',
    contact: invitedBy || 'your administrator',
  });
  return { subject: 'Your access to the Raftar Fleet Dashboard', text, html };
}

// Exit Interviews invite. password = null when the person already has a Raftar
// account (fleet dashboard): they keep the password they have.
function exitInviteEmail(email, password, invitedBy) {
  const who = invitedBy || 'Your administrator';
  const pwText = password
    ? `Email: ${email}
Temporary password: ${password}

Getting started
1. Open the link above and sign in with the email and temporary password.
2. Right after you sign in, you will be asked to choose your own password (at least 6 characters).`
    : `Email: ${email}
Password: the same password you already use for the Raftar Fleet dashboard.`;
  const text = `Hello,

${who} has given you access to Raftar Exit Interviews, where exit interview cases and the confidential exit records are managed.

Exit Interviews: ${EXIT_URL}
${pwText}

These records are confidential. Please keep your password private and do not share it with anyone. If you did not expect this email, you can ignore it or contact ${invitedBy || 'your administrator'}.

Sent by Raftar`;
  const html = inviteHtml({
    preheader: 'Your sign-in details for Raftar Exit Interviews',
    appName: 'Exit Interviews', tagline: 'Raftar · People & Culture', who,
    intro: 'has given you access to <b>Raftar Exit Interviews</b>, where exit interview cases and the confidential exit records are managed.',
    rows: password
      ? [['Email', esc(email)], ['Temporary password', esc(password), true]]
      : [['Email', esc(email)], ['Password', 'The same password you already use for the Raftar Fleet dashboard']],
    ctaLabel: 'Open Exit Interviews', ctaUrl: EXIT_URL,
    steps: password
      ? ['Click <b>Open Exit Interviews</b> and enter the email and temporary password above.',
        'Right after you sign in, you will be asked to <b>choose your own password</b> (at least 6 characters).']
      : ['Click <b>Open Exit Interviews</b> and sign in with your usual Raftar email and password.'],
    note: '<b>Confidential.</b> These records are private HR documents. Please keep your password to yourself and do not share it with anyone.',
    contact: invitedBy || 'your administrator',
  });
  return { subject: 'Your access to Raftar Exit Interviews', text, html };
}

// raftar-ops "Add user" invite: one email for whichever apps were ticked, pointing
// at raftar-ops, where each ticked app shows up as a skill. password = null when
// the person already had a Raftar account (they keep their password).
const OPS_URL = process.env.OPS_PUBLIC_URL || 'https://raftar-ops.up.railway.app/';
const APP_LABEL = { meter: 'Meter Reading', exit: 'Exit Interviews' };
function raftarInviteEmail(email, password, invitedBy, apps) {
  const who = invitedBy || 'Your administrator';
  const names = apps.map(a => APP_LABEL[a] || a);
  const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
  const text = `Hello,

${who} has given you access to Raftar (${list}).

Raftar: ${OPS_URL}
Email: ${email}
${password ? `Temporary password: ${password}

Getting started
1. Open the link above and sign in with the email and temporary password.
2. Right after you sign in, you will be asked to choose your own password (at least 6 characters).` : 'Password: the same password you already use for Raftar.'}

Please keep your password private and do not share it with anyone. If you did not expect this email, you can ignore it or contact ${invitedBy || 'your administrator'}.

Sent by Raftar`;
  const html = inviteHtml({
    preheader: 'Your sign-in details for Raftar',
    appName: 'Raftar', tagline: 'Operations · ' + names.join(' · '), who,
    intro: `has given you access to <b>Raftar</b>. You can open: ${names.map(n => '<b>' + esc(n) + '</b>').join(' and ')}.`,
    rows: password
      ? [['Email', esc(email)], ['Temporary password', esc(password), true]]
      : [['Email', esc(email)], ['Password', 'The same password you already use for Raftar']],
    ctaLabel: 'Open Raftar', ctaUrl: OPS_URL,
    steps: password
      ? ['Click <b>Open Raftar</b> and enter the email and temporary password above.',
        'Right after you sign in, you will be asked to <b>choose your own password</b> (at least 6 characters).']
      : ['Click <b>Open Raftar</b> and sign in with your usual email and password.'],
    note: apps.includes('exit')
      ? '<b>Confidential.</b> Exit interview records are private HR documents. Please keep your password to yourself.'
      : 'Please keep your password private and do not share it with anyone.',
    contact: invitedBy || 'your administrator',
  });
  return { subject: 'Your access to Raftar', text, html };
}

async function sendMail(to, { subject, text, html }) {
  const boundary = 'raftar' + crypto.randomBytes(8).toString('hex');
  const raw = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(text).toString('base64'),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(html).toString('base64'),
    `--${boundary}--`,
  ].join('\r\n');
  await gmail().users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(raw).toString('base64url') } });
}

function mount(app) {
  const guard = (req, res, next) => (keyOk(req) ? next() : res.status(404).end());
  // ?app=meter (default) or ?app=exit — each app has its own access list over one account store
  app.get('/api/dashboard-users', guard, (req, res) => res.json({ ok: true, app: appOf(req), accounts: auth.listAccounts(appOf(req)) }));
  // Everyone with any access, one row each (raftar-ops "Users" list)
  app.get('/api/raftar-users', guard, (req, res) => {
    const byEmail = new Map();
    for (const a of auth.APPS) for (const acc of auth.listAccounts(a)) byEmail.set(acc.email, acc);
    res.json({ ok: true, accounts: [...byEmail.values()] });
  });
  // Tick boxes on the Users list: set exactly which apps someone has (no email sent)
  app.post('/api/raftar-users/:email/apps', guard, express.json({ limit: '4kb' }), (req, res) => {
    const email = String(req.params.email || '').trim().toLowerCase();
    const ok = auth.setApps(email, Array.isArray(req.body.apps) ? req.body.apps : []);
    if (ok) logger.info(`[access] ${email} apps set to [${(req.body.apps || []).join(',')}]`);
    res.json({ ok, error: ok ? undefined : 'No invited account with that email.' });
  });
  app.post('/api/dashboard-users', guard, express.json({ limit: '4kb' }), async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const invitedBy = String(req.body.invitedBy || '').slice(0, 80);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    // raftar-ops "Add user": several apps at once, one email pointing at raftar-ops
    if (Array.isArray(req.body.apps)) {
      const apps = auth.APPS.filter(a => req.body.apps.includes(a));
      if (!apps.length) return res.status(400).json({ ok: false, error: 'Choose at least one: Meter Reading or Exit Interviews.' });
      let pw = null;
      // someone who already has an account only gets the missing apps; their password is never reset here
      const had = auth.appsOf(email);
      const missing = apps.filter(a => !had.includes(a));
      if (had.length && !missing.length) return res.status(400).json({ ok: false, error: 'This person already has that access.' });
      try { for (const a of missing) pw = auth.inviteAccount(email, invitedBy, a) || pw; }
      catch (err) { return res.status(400).json({ ok: false, error: err.message }); }
      try {
        await sendMail(email, raftarInviteEmail(email, pw, invitedBy, auth.appsOf(email)));
        logger.info(`[access] ${invitedBy || 'admin'} added ${email} [${apps.join(',')}] — invite emailed`);
        return res.json({ ok: true, email, emailed: true, existing: !pw });
      } catch (err) {
        logger.error(`[access] invite email to ${email} failed: ${err.message}`);
        return res.json({ ok: true, email, emailed: false, password: pw, error: 'Account created, but the email could not be sent.' });
      }
    }
    const appName = appOf(req);
    let pw;
    try { pw = auth.inviteAccount(email, invitedBy, appName); } catch (err) { return res.status(400).json({ ok: false, error: err.message }); }
    try {
      // a meter invite always has a password; an exit invite may reuse an existing one
      await sendMail(email, appName === 'exit' ? exitInviteEmail(email, pw, invitedBy) : inviteEmail(email, pw, invitedBy));
      logger.info(`[access] ${invitedBy || 'admin'} gave ${appName} access to ${email} — invite emailed`);
      res.json({ ok: true, email, emailed: true, existing: !pw });
    } catch (err) {
      // the account exists; hand the password back so the admin can pass it on
      logger.error(`[access] invite email to ${email} failed: ${err.message}`);
      res.json({ ok: true, email, emailed: false, password: pw, error: 'Account created, but the email could not be sent.' });
    }
  });
  // Exit Interviews app signs people in with their dashboard email + password.
  // Server-to-server only (same shared key); the caller does its own rate limiting.
  app.post('/api/dashboard-users/verify', guard, express.json({ limit: '4kb' }), (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    // app 'any' = raftar-ops: anyone with access to at least one Raftar app
    const anyApp = req.body.app === 'any';
    let result = auth.verifyLogin(email, String(req.body.password || ''), anyApp ? 'meter' : appOf(req));
    if (anyApp && result === 'no-access' && auth.appsOf(email).length) result = 'ok';
    const label = anyApp ? 'any' : appOf(req);
    if (result !== 'ok') logger.warn(`[access] verify ${result} for "${email}" (${label})`);
    const ok = result === 'ok';
    res.json({
      ok, reason: ok ? undefined : result, email: ok ? email : undefined,
      apps: ok ? auth.appsOf(email) : undefined,
      owner: ok ? auth.listAccounts('meter').some(a => a.email === email && a.kind === 'owner') : undefined,
      // still on the emailed password → the app offers "set your own password" straight away
      mustChange: ok ? auth.usingTempPassword(email) : undefined,
    });
  });
  // Which apps an account can open now ([] once removed) — raftar-ops re-checks on refresh.
  app.get('/api/dashboard-users/:email/apps', guard, (req, res) => {
    res.json({ ok: true, apps: auth.appsOf(String(req.params.email || '').trim().toLowerCase()) });
  });
  // The app's "set your own password" step; checks the current password itself.
  app.post('/api/dashboard-users/change-password', guard, express.json({ limit: '4kb' }), (req, res) => {
    const err = auth.changePassword(req.body.email, String(req.body.current || ''), String(req.body.newpw || ''));
    res.json(err ? { ok: false, error: err } : { ok: true });
  });
  app.delete('/api/dashboard-users/:email', guard, (req, res) => {
    const email = String(req.params.email || '').trim().toLowerCase();
    const removed = auth.removeAccount(email, appOf(req));
    if (removed) logger.info(`[access] ${appOf(req)} access removed for ${email}`);
    res.json({ ok: removed, error: removed ? undefined : 'No invited account with that email.' });
  });
}

module.exports = { mount, inviteEmail, exitInviteEmail, raftarInviteEmail };
