// ─── Dashboard login (email + password) ──────────────────────────────────────
// Asked for by Tahir on 2026-10-26: the dashboard shows invoice amounts, so it
// must not open for anyone holding the link.
//
// Accounts live in the env var DASHBOARD_USERS as JSON:
//   {"tahir.saleem@niete.edu.pk":"<salt>$<pbkdf2-sha256 hash>", …}
// (make a hash with:  node -e "console.log(require('./src/web/auth').hashPassword('…'))")
// Sessions are a signed cookie (HMAC with DASHBOARD_SECRET) — no server store.
// The cookie is SameSite=None; Secure; Partitioned so the login also works
// inside the /pa app, which shows this dashboard in an iframe on another domain.
const crypto = require('crypto');
const express = require('express');
const logger = require('../logger');

const COOKIE = 'rd_sess';
const SESSION_DAYS = 30;

function secret() {
  const s = process.env.DASHBOARD_SECRET;
  if (!s) throw new Error('DASHBOARD_SECRET is not set');
  return s;
}
// Accounts = DASHBOARD_USERS (env, set by us) overlaid by the passwords people
// chose themselves on /account, which are kept on the persistent volume so a
// redeploy or restart never undoes them.
const fs = require('fs');
const path = require('path');
const OWN_FILE = path.join(__dirname, '..', '..', 'credentials', 'dashboard_passwords.json');
function ownPasswords() {
  try { return JSON.parse(fs.readFileSync(OWN_FILE, 'utf8')); } catch { return {}; }
}
// People invited from the /pa Users page (super admin): volume file
//   credentials/dashboard_accounts.json  { email: { hash, createdAt, invitedBy } }
const INVITED_FILE = path.join(__dirname, '..', '..', 'credentials', 'dashboard_accounts.json');
function invited() {
  try { return JSON.parse(fs.readFileSync(INVITED_FILE, 'utf8')); } catch { return {}; }
}
function envUsers() {
  try { return JSON.parse(process.env.DASHBOARD_USERS || '{}'); } catch { return {}; } // bad env → none
}
function users() {
  const env = envUsers(), inv = invited(), own = ownPasswords();
  const out = {};
  for (const [email, a] of Object.entries(inv)) out[email] = a.hash;
  for (const email of Object.keys(env)) out[email] = env[email];
  // a password the person set themselves wins; removing the account still revokes
  for (const email of Object.keys(out)) if (own[email]) out[email] = own[email];
  return out;
}
function setOwnPassword(email, pw) {
  const own = ownPasswords();
  own[email] = hashPassword(pw);
  fs.writeFileSync(OWN_FILE, JSON.stringify(own, null, 2));
  return own[email];
}
// a short fingerprint of the current hash, carried in the session token, so
// changing the password signs every other device out
const pwTag = stored => crypto.createHash('sha256').update(String(stored)).digest('base64url').slice(0, 10);

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + '$' + crypto.pbkdf2Sync(String(pw), salt, 120000, 32, 'sha256').toString('hex');
}
function verifyPassword(pw, stored) {
  const [salt, h] = String(stored || '').split('$');
  if (!salt || !h) return false;
  const calc = crypto.pbkdf2Sync(String(pw), salt, 120000, 32, 'sha256');
  const want = Buffer.from(h, 'hex');
  return want.length === calc.length && crypto.timingSafeEqual(calc, want);
}

// token = base64url(email|expiresMs|pwTag) . HMAC
function makeToken(email, days) {
  const payload = Buffer.from(`${email}|${Date.now() + days * 86400000}|${pwTag(users()[email])}`).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}
function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const want = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  const [email, exp, tag] = Buffer.from(payload, 'base64url').toString('utf8').split('|');
  const stored = users()[email];
  if (!email || !(+exp > Date.now()) || !stored) return null; // expired or account removed
  if (tag !== pwTag(stored)) return null;                     // password changed since
  return email;
}
function cookieOf(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function setCookie(res, value, maxAgeSec) {
  const parts = [`${COOKIE}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=None', 'Partitioned'];
  if (maxAgeSec != null) parts.push(`Max-Age=${maxAgeSec}`);
  res.setHeader('Set-Cookie', parts.join('; '));
}

// only same-site relative paths may be used as the post-login destination
const safeNext = n => (typeof n === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(n) ? n : '/dashboard');

// Signed in at all (any app) — for /account, so an Exit-Interviews-only account
// can still choose its own password.
function requireAccount(req, res, next) {
  let email = null;
  try { email = readToken(cookieOf(req)); } catch (err) {
    logger.error('[auth] ' + err.message);
    return res.status(503).send('Login is not configured yet.');
  }
  if (email) { req.user = email; return next(); }
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}
function requireLogin(req, res, next) {
  let email = null;
  try { email = readToken(cookieOf(req)); } catch (err) {
    logger.error('[auth] ' + err.message);
    return res.status(503).send('Login is not configured yet.');
  }
  // an Exit-Interviews-only account signs in fine but never sees the fleet dashboard
  if (email && hasApp(email, 'meter')) { req.user = email; return next(); }
  if (email) return res.status(403).send(shell('No access', 'Fleet dashboard',
    '<p class="sub">This account does not have access to the Fleet dashboard. Ask your administrator if you need it.</p><p class="foot"><a href="/logout">Sign out</a></p>'));
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

// brute-force brake: 10 failed attempts per IP per 15 minutes
const fails = new Map();
const WINDOW = 15 * 60 * 1000, MAX_FAILS = 10;
const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
function tooMany(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.since > WINDOW) return false;
  return f.n >= MAX_FAILS;
}
function noteFail(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.since > WINDOW) fails.set(ip, { n: 1, since: Date.now() });
  else f.n++;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">';
const STYLE = `<style>
:root{--bg:#0E1838;--card:rgba(255,255,255,.07);--line:rgba(199,210,254,.18);--fg:#F8FAFC;--fg2:#DCE4F5;--mut:#A7B4D3;--accent:#2DD4BF;--bad:#FCA5A5}
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:grid;place-items:center;padding:24px 16px;color:var(--fg);font:15px/1.5 'Fira Sans',system-ui,sans-serif;
  background-color:var(--bg);background-image:radial-gradient(900px 520px at 8% -8%,rgba(45,212,191,.18),transparent 62%),radial-gradient(900px 560px at 100% -5%,rgba(129,140,248,.26),transparent 60%),radial-gradient(800px 600px at 50% 110%,rgba(192,132,252,.14),transparent 65%),linear-gradient(165deg,#0B1533 0%,#12204A 48%,#1A1D4E 100%);background-attachment:fixed}
.card{width:100%;max-width:400px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px 24px;box-shadow:0 20px 50px rgba(3,8,32,.45);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:22px}
.logo{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-weight:700;color:#04111d;background:linear-gradient(135deg,#2DD4BF,#818CF8)}
.logo img{width:44px;height:44px;border-radius:12px;object-fit:cover}
h1{font-size:18px;font-weight:600;line-height:1.2}
.sub{font-size:13px;color:var(--mut)}
label{display:block;font-size:13px;font-weight:500;color:var(--fg2);margin:14px 0 6px}
input[type=email],input[type=password],input.pwf{width:100%;height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:rgba(6,12,36,.45);color:var(--fg);font:16px 'Fira Sans',sans-serif;color-scheme:dark}
input:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.row{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:14px;color:var(--fg2);min-height:44px}
.row input{width:18px;height:18px;accent-color:var(--accent)}
button{width:100%;height:48px;margin-top:8px;border:0;border-radius:12px;background:linear-gradient(135deg,#2DD4BF,#22D3EE);color:#042F2E;font:600 16px 'Fira Sans',sans-serif;cursor:pointer}
button:hover{filter:brightness(1.05)}
.err{margin-top:14px;padding:10px 12px;border-radius:10px;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.35);color:var(--bad);font-size:14px}
.foot{margin-top:18px;font-size:12px;color:var(--mut);text-align:center}
.pw{position:relative}
.pw input.pwf{padding-right:52px}
.pw button.pw-t{position:absolute;right:3px;top:50%;transform:translateY(-50%);width:44px;height:40px;margin:0;padding:0;border:0;border-radius:10px;background:transparent;color:var(--mut,#94A3B8);display:grid;place-items:center;cursor:pointer;box-shadow:none}
.pw button.pw-t:hover{color:var(--fg,#F8FAFC);filter:none}
.pw button.pw-t svg{width:20px;height:20px}
.ok{margin-top:14px;padding:10px 12px;border-radius:10px;background:rgba(45,212,191,.12);border:1px solid rgba(45,212,191,.4);color:#99F6E4;font-size:14px}
.hint{font-size:12px;color:var(--mut);margin-top:6px}
.back{display:inline-flex;align-items:center;min-height:44px;color:var(--fg2);text-decoration:underline;text-underline-offset:3px;font-size:14px}
</style>`;
function shell(title, sub, inner) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Raftar Fleet Operations</title>${FONT}${STYLE}</head><body>
<main class="card">
  <div class="brand"><div class="logo"><img src="/brand-logo" alt="" onerror="this.remove()">R</div><div><h1>Fleet Operations</h1><div class="sub">${sub}</div></div></div>
  ${inner}
</main><script>(function(){var EYE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></svg>',OFF='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="m2 2 20 20"/></svg>';
document.querySelectorAll('input[type=password]').forEach(function(inp){inp.classList.add('pwf');
var w=document.createElement('div');w.className='pw';inp.parentNode.insertBefore(w,inp);w.appendChild(inp);
var b=document.createElement('button');b.type='button';b.className='pw-t';b.setAttribute('aria-label','Show password');b.setAttribute('aria-pressed','false');b.innerHTML=EYE;
b.addEventListener('click',function(){var show=inp.type==='password';inp.type=show?'text':'password';b.setAttribute('aria-label',show?'Hide password':'Show password');b.setAttribute('aria-pressed',String(show));b.innerHTML=show?OFF:EYE;inp.focus();});
w.appendChild(b);});})();</script></body></html>`;
}

function loginPage({ next, error = '', email = '' }) {
  return shell('Sign in', 'Raftar · sign in to continue', `
  <form method="post" action="/login">
    <input type="hidden" name="next" value="${esc(next)}">
    <label for="email">Email</label>
    <input id="email" name="email" type="email" autocomplete="username" required value="${esc(email)}" placeholder="name@niete.edu.pk">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <label class="row"><input type="checkbox" name="remember" value="1" checked> Keep me signed in on this device</label>
    ${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
    <button type="submit">Sign in</button>
  </form>
  <p class="foot">Access is limited to NIETE staff. Ask Tahir Saleem for an account.</p>`);
}

const MIN_PW = 6;
// first = signed in with the emailed temporary password just now: no "current
// password" box (they typed it a moment ago) and a way to skip for later.
function accountPage({ email, error = '', done = false, first = false, next = '/dashboard' }) {
  if (first) return shell('Set your own password', esc(email), `
  <p class="hint" style="margin-top:0">Welcome! You signed in with a temporary password. Choose your own password now so you can remember it.</p>
  <form method="post" action="/account">
    <input type="hidden" name="email" value="${esc(email)}" autocomplete="username">
    <input type="hidden" name="first" value="1">
    <input type="hidden" name="next" value="${esc(next)}">
    <label for="newpw">New password</label>
    <input id="newpw" name="newpw" type="password" autocomplete="new-password" minlength="${MIN_PW}" required>
    <p class="hint">At least ${MIN_PW} characters. Pick one you will remember.</p>
    <label for="confirm">Repeat new password</label>
    <input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="${MIN_PW}" required>
    ${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
    <button type="submit">Save my password</button>
  </form>
  <p class="foot"><a class="back" href="${esc(next)}">Skip for now</a></p>`);
  return shell('Change password', esc(email), `
  <form method="post" action="/account">
    <input type="hidden" name="email" value="${esc(email)}" autocomplete="username">
    <label for="current">Current password</label>
    <input id="current" name="current" type="password" autocomplete="current-password" required>
    <label for="newpw">New password</label>
    <input id="newpw" name="newpw" type="password" autocomplete="new-password" minlength="${MIN_PW}" required>
    <p class="hint">At least ${MIN_PW} characters. Pick one you will remember.</p>
    <label for="confirm">Repeat new password</label>
    <input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="${MIN_PW}" required>
    ${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
    ${done ? '<div class="ok" role="status">Password changed. Other devices have been signed out.</div>' : ''}
    <button type="submit">Save new password</button>
  </form>
  <p class="foot"><a class="back" href="/dashboard">Back to dashboard</a></p>`);
}

function mount(app) {
  app.get('/login', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.send(loginPage({ next: safeNext(req.query.next) }));
  });
  app.post('/login', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const ip = ipOf(req);
    const next = safeNext(req.body.next);
    const email = String(req.body.email || '').trim().toLowerCase();
    if (tooMany(ip)) {
      return res.status(429).send(loginPage({ next, email, error: 'Too many attempts. Please wait 15 minutes and try again.' }));
    }
    const stored = users()[email];
    if (!stored || !verifyPassword(req.body.password || '', stored)) {
      noteFail(ip);
      logger.warn(`[auth] failed sign-in for "${email}" from ${ip}`);
      return res.status(401).send(loginPage({ next, email, error: 'Email or password is incorrect.' }));
    }
    fails.delete(ip);
    const remember = req.body.remember === '1';
    setCookie(res, makeToken(email, remember ? SESSION_DAYS : 1), remember ? SESSION_DAYS * 86400 : null);
    logger.info(`[auth] ${email} signed in`);
    if (usingTempPassword(email)) return res.redirect('/account?first=1&next=' + encodeURIComponent(next));
    res.redirect(next);
  });
  app.get('/logout', (req, res) => { setCookie(res, '', 0); res.redirect('/login'); });

  // change your own password (signed-in users only)
  app.get('/account', requireAccount, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const first = req.query.first === '1' && usingTempPassword(req.user);
    res.send(accountPage({ email: req.user, done: req.query.done === '1', first, next: safeNext(req.query.next) }));
  });
  app.post('/account', requireAccount, express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const email = req.user, ip = ipOf(req);
    const first = req.body.first === '1' && usingTempPassword(email);
    const next = safeNext(req.body.next);
    const page = error => res.status(400).send(accountPage({ email, error, first, next }));
    if (tooMany(ip)) return res.status(429).send(accountPage({ email, error: 'Too many attempts. Please wait 15 minutes and try again.' }));
    const { current = '', newpw = '', confirm = '' } = req.body;
    if (!first && !verifyPassword(current, users()[email])) { noteFail(ip); return page('Current password is incorrect.'); }
    if (String(newpw).length < MIN_PW) return page(`New password must be at least ${MIN_PW} characters.`);
    if (newpw !== confirm) return page('The two new passwords do not match.');
    if (verifyPassword(newpw, users()[email])) return page('The new password is the same as the current one.');
    try { setOwnPassword(email, newpw); } catch (err) {
      logger.error('[auth] could not save password: ' + err.message);
      return res.status(500).send(accountPage({ email, error: 'Could not save the new password. Please try again.' }));
    }
    setCookie(res, makeToken(email, SESSION_DAYS), SESSION_DAYS * 86400); // keep this device signed in
    logger.info(`[auth] ${email} changed their password`);
    res.redirect(first ? next : '/account?done=1');
  });
}

// ─── Invites (called by the /pa Users page through src/web/accessApi.js) ─────
const ALNUM = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L — easy to type
function tempPassword(n = 8) {
  let p = ''; for (let i = 0; i < n; i++) p += ALNUM[crypto.randomInt(ALNUM.length)];
  return p;
}
// One account, one password, per-app access (2026-10-26): 'meter' = this fleet
// dashboard, 'exit' = Exit Interviews. Invited accounts made before this have no
// `apps` field and were dashboard invites, so they count as ['meter']. The owner
// (DASHBOARD_USERS) has every app.
const APPS = ['meter', 'exit'];
function appsOf(email) {
  if (envUsers()[email]) return APPS.slice();
  const a = invited()[email];
  return a ? (Array.isArray(a.apps) ? a.apps : ['meter']) : [];
}
const hasApp = (email, app) => appsOf(email).includes(app);
// still on the password that was emailed (invited, never chose their own)
const usingTempPassword = email => !!invited()[email] && !envUsers()[email] && !ownPasswords()[email];

// Sets a new password after checking the current one. Used by Exit Interviews
// (first sign-in with the emailed password). Returns an error message or null.
function changePassword(email, current, newpw) {
  email = String(email || '').trim().toLowerCase();
  const stored = users()[email];
  if (!stored || !verifyPassword(current || '', stored)) return 'Current password is incorrect.';
  if (String(newpw || '').length < MIN_PW) return `New password must be at least ${MIN_PW} characters.`;
  if (verifyPassword(newpw, stored)) return 'The new password is the same as the current one.';
  setOwnPassword(email, String(newpw));
  logger.info(`[auth] ${email} set their own password (via app)`);
  return null;
}

function listAccounts(app = 'meter') {
  const env = envUsers(), inv = invited();
  return [
    ...Object.keys(env).map(email => ({ email, kind: 'owner', apps: APPS.slice() })),
    ...Object.entries(inv).filter(([e]) => !env[e])
      .map(([email, a]) => ({ email, kind: 'invited', apps: Array.isArray(a.apps) ? a.apps : ['meter'], createdAt: a.createdAt, invitedBy: a.invitedBy })),
  ].filter(a => a.apps.includes(app));
}
// Gives `email` access to `app`. A new account (or a re-invite to the same app)
// gets a fresh temp password, which is returned; someone who already has a Raftar
// account for another app keeps their password and null is returned.
function inviteAccount(email, invitedBy, app = 'meter') {
  if (!APPS.includes(app)) throw new Error('Unknown app');
  if (envUsers()[email]) throw new Error('This email is the owner account; it is managed separately.');
  const inv = invited();
  const cur = inv[email];
  const curApps = cur ? (Array.isArray(cur.apps) ? cur.apps : ['meter']) : [];
  if (cur && !curApps.includes(app)) {
    cur.apps = [...curApps, app];
    fs.writeFileSync(INVITED_FILE, JSON.stringify(inv, null, 2));
    return null;
  }
  const pw = tempPassword();
  inv[email] = { hash: hashPassword(pw), apps: curApps.length ? curApps : [app], createdAt: cur?.createdAt || new Date().toISOString(), invitedBy: invitedBy || '' };
  fs.writeFileSync(INVITED_FILE, JSON.stringify(inv, null, 2));
  const own = ownPasswords();
  if (own[email]) { delete own[email]; fs.writeFileSync(OWN_FILE, JSON.stringify(own, null, 2)); } // fresh start
  return pw;
}
// Sets exactly which apps an invited account has (Users page ticks). An empty
// list removes the account. Returns false if there is no such invited account.
function setApps(email, apps) {
  const inv = invited();
  if (!inv[email]) return false;
  const clean = APPS.filter(a => (apps || []).includes(a));
  if (!clean.length) {
    for (const a of APPS) removeAccount(email, a); // the last one deletes the account
    return true;
  }
  inv[email].apps = clean;
  fs.writeFileSync(INVITED_FILE, JSON.stringify(inv, null, 2));
  return true;
}

// Takes `app` away; the account itself goes only when it has no app left.
function removeAccount(email, app = 'meter') {
  const inv = invited();
  const cur = inv[email];
  if (!cur) return false;
  const left = (Array.isArray(cur.apps) ? cur.apps : ['meter']).filter(a => a !== app);
  if (left.length) {
    cur.apps = left;
    fs.writeFileSync(INVITED_FILE, JSON.stringify(inv, null, 2));
    return true; // requireLogin / verifyLogin check the app on every request
  }
  delete inv[email];
  fs.writeFileSync(INVITED_FILE, JSON.stringify(inv, null, 2));
  const own = ownPasswords();
  if (own[email]) { delete own[email]; fs.writeFileSync(OWN_FILE, JSON.stringify(own, null, 2)); }
  return true; // their session cookie stops working at once (readToken checks the account exists)
}

// Same email + password as the dashboard sign-in; used by other Raftar apps (Exit
// Interviews) through accessApi so there is one password to remember.
// 'bad' = wrong email/password, 'no-access' = right password but not for this app.
function verifyLogin(email, pw, app = 'meter') {
  email = String(email || '').trim().toLowerCase();
  const stored = users()[email];
  if (!stored || !verifyPassword(pw || '', stored)) return 'bad';
  return hasApp(email, app) ? 'ok' : 'no-access';
}

module.exports = { mount, requireLogin, hashPassword, verifyPassword, verifyLogin, usingTempPassword, changePassword, setApps, listAccounts, inviteAccount, removeAccount, appsOf, APPS };
