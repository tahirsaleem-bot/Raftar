// HTTP server: PIN-protected mobile app + JSON API. Background poll every POLL_MINUTES.
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const store = require('./store');
const engine = require('./engine');
const render = require('./render');
const g = require('./google');
const ai = require('./ai');

let lastAgentVisit = null;

const app = express();
app.use(express.json({ limit: '1mb' }));

// A shared PIN rather than accounts: one person uses this, from a phone, and the data it
// holds is already in their mailbox. The PIN keeps the URL from being enough on its own.
//
// On its own a six-digit PIN is a million guesses, which an unthrottled script finishes in
// hours - and behind it are exit interview records naming people and carrying harassment
// disclosures. So guessing is rate limited per client: a short delay after a few misses,
// growing to a lockout, and Tahir is mailed the first time it looks deliberate.
const MISSES_BEFORE_DELAY = 3;
const MISSES_BEFORE_LOCK = 10;
const LOCK_MS = 15 * 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const attempts = new Map();   // client -> { misses, first, lockedUntil, warned }

// Railway terminates TLS in front of us, so the caller's address is in the forwarded
// header; fall back to the socket when running locally.
const clientOf = req =>
  String(req.get('x-forwarded-for') || req.ip || '').split(',')[0].trim() || 'unknown';

function record(req) {
  const key = clientOf(req);
  const now = Date.now();
  let a = attempts.get(key);
  if (!a || now - a.first > WINDOW_MS) a = { misses: 0, first: now, lockedUntil: 0, warned: false };
  attempts.set(key, a);
  // Keep the map from growing without bound on a public URL.
  if (attempts.size > 500) {
    for (const [k, v] of attempts) if (now - v.first > WINDOW_MS && now > v.lockedUntil) attempts.delete(k);
  }
  return a;
}

// Constant-time compare, so the response time cannot be used to learn the PIN digit by
// digit. The length is padded first because timingSafeEqual throws on a length mismatch.
function samePin(given, expected) {
  const a = Buffer.from(String(given).padEnd(64).slice(0, 64));
  const b = Buffer.from(String(expected).padEnd(64).slice(0, 64));
  return crypto.timingSafeEqual(a, b) && String(given).length === String(expected).length;
}

// Email sign-in: the meter-reading service checks the password, we hand back a signed
// session (email + expiry, HMAC). Turned on by METER_AUTH_KEY + SESSION_SECRET.
const SESSION_DAYS = 30;
const emailLogin = () => !!(cfg.METER_AUTH_KEY && cfg.SESSION_SECRET);
const loginRequired = () => !!cfg.APP_PIN || emailLogin();
const sign = body => crypto.createHmac('sha256', cfg.SESSION_SECRET).update(body).digest('base64url');

function makeSession(email) {
  const body = Buffer.from(JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 86400000 })).toString('base64url');
  return body + '.' + sign(body);
}
// Who may open Exit Interviews is managed on the raftar-ops Users page and kept by the
// meter-reading service (one account store, per-app access). Refreshed every minute so a
// removed person is locked out within a minute; until the first fetch succeeds, only
// EXIT_ALLOWED_EMAILS (the owner) is let in.
let accessList = null, accessAt = 0;
async function refreshAccess() {
  if (!emailLogin() || Date.now() - accessAt < 60000) return;
  accessAt = Date.now();
  try {
    const r = await fetch(cfg.METER_URL + '/api/dashboard-users?app=exit', {
      headers: { 'x-admin-key': cfg.METER_AUTH_KEY }, signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    if (r.ok && j.ok && Array.isArray(j.accounts)) accessList = j.accounts.map(a => String(a.email).toLowerCase());
  } catch { /* keep the last good list */ }
}
const allowedEmails = () => accessList || cfg.EXIT_ALLOWED_EMAILS;

function sessionEmail(token) {
  if (!emailLogin()) return null;
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(body, 'base64url').toString());
    // re-checked on every request, so removing an email from the list locks it out at once
    return Date.now() < x && allowedEmails().includes(e) ? e : null;
  } catch { return null; }
}

function authed(req) {
  if (!loginRequired()) return true;
  if (sessionEmail(req.get('x-session') || req.query.session)) return true;
  return !!cfg.APP_PIN && samePin(req.get('x-pin') || req.query.pin || '', cfg.APP_PIN);
}

// Wrong email/password counts against the same per-client limit as a wrong PIN.
function noteMiss(req) {
  const a = record(req);
  a.misses++;
  if (a.misses >= MISSES_BEFORE_LOCK) {
    a.lockedUntil = Date.now() + LOCK_MS;
    if (!a.warned) { a.warned = true; engine.alertPinAttack(clientOf(req), a.misses).catch(() => {}); }
  }
  return a;
}

app.post('/api/login', async (req, res) => {
  if (!emailLogin()) return res.status(404).json({ error: 'Email sign-in is not set up' });
  const a = record(req);
  if (Date.now() < a.lockedUntil) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  let ok = false, mustChange = false;
  try {
    const r = await fetch(cfg.METER_URL + '/api/dashboard-users/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': cfg.METER_AUTH_KEY },
      body: JSON.stringify({ email, password, app: 'exit' }),
      signal: AbortSignal.timeout(10000),
    });
    const j = r.ok ? await r.json() : {};
    ok = j.ok === true;
    mustChange = j.mustChange === true;
    if (j.reason === 'no-access') return res.status(403).json({ error: 'This account does not have access to Exit Interviews.' });
  } catch (e) {
    return res.status(503).json({ error: 'Sign-in service is not reachable. Try again in a minute.' });
  }
  if (!ok) {
    const m = noteMiss(req);
    const delay = m.misses >= MISSES_BEFORE_DELAY ? Math.min(2000, 250 * (m.misses - 2)) : 0;
    return setTimeout(() => res.status(401).json({ error: 'Email or password is incorrect.' }), delay);
  }
  attempts.delete(clientOf(req));
  accessAt = 0; refreshAccess().catch(() => {}); // pick up a just-invited person straight away
  if (accessList && !accessList.includes(email)) accessList.push(email);
  res.json({ ok: true, email, session: makeSession(email), mustChange });
});

// First sign-in with the emailed password: choose your own. Needs a valid session, and the
// meter-reading service re-checks the current password before changing anything.
app.post('/api/change-password', async (req, res) => {
  const email = sessionEmail(req.get('x-session'));
  if (!email) return res.status(401).json({ error: 'Please sign in again' });
  const { current = '', newpw = '' } = req.body || {};
  try {
    const r = await fetch(cfg.METER_URL + '/api/dashboard-users/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': cfg.METER_AUTH_KEY },
      body: JSON.stringify({ email, current: String(current), newpw: String(newpw) }),
      signal: AbortSignal.timeout(10000),
    });
    const j = r.ok ? await r.json() : { error: 'Could not change the password' };
    if (!j.ok) return res.status(400).json({ error: j.error || 'Could not change the password' });
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: 'Sign-in service is not reachable. Try again in a minute.' });
  }
});

function guard(req, res, next) {
  if (!loginRequired()) return next();
  refreshAccess().catch(() => {});
  const a = record(req);
  const now = Date.now();

  if (now < a.lockedUntil) {
    res.set('Retry-After', String(Math.ceil((a.lockedUntil - now) / 1000)));
    return res.status(429).json({ error: 'Too many wrong PINs. Try again shortly.' });
  }

  if (authed(req)) { attempts.delete(clientOf(req)); return next(); }

  a.misses++;
  if (a.misses >= MISSES_BEFORE_LOCK) {
    a.lockedUntil = now + LOCK_MS;
    if (!a.warned) {
      a.warned = true;
      engine.alertPinAttack(clientOf(req), a.misses).catch(() => {});
    }
    res.set('Retry-After', String(LOCK_MS / 1000));
    return res.status(429).json({ error: 'Too many wrong PINs. Try again shortly.' });
  }

  // A slice of a second is nothing to someone typing it in and ruinous to a script.
  const delay = a.misses >= MISSES_BEFORE_DELAY ? Math.min(2000, 250 * (a.misses - 2)) : 0;
  setTimeout(() => res.status(401).json({ error: 'PIN required' }), delay);
}

// The trigger probe runs the live matcher against a body-only resignation, so this says
// what the deployed code actually does rather than what it claims to.
app.get('/health', (_req, res) => res.json({
  ok: true,
  at: new Date().toISOString(),
  // Whether a PIN is set at all. The app asks before showing its gate, so turning the PIN
  // off is a single environment variable rather than a code change - and turning it back
  // on takes effect without anyone having to be told.
  pin: loginRequired(),
  login: emailLogin() ? 'email' : (cfg.APP_PIN ? 'pin' : 'none'),
  trigger: engine.looksLikeResignation({ subject: 'Quick note', body: 'I am writing to submit my resignation.' })
    ? 'subject+body+forward' : 'subject only',
}));

// ---------- the scheduled Claude Code routine (bearer token; only its SHA-256 is stored) ----------
// Where no Anthropic key is configured, the drafting is done by a routine running Claude
// Code on a schedule: it reads /agent/tasks, writes the record and posts it to
// /agent/result. That keeps the writing on the existing Claude subscription instead of a
// second, metered one, and because the routine runs in the cloud it does not care whether
// the laptop is on.
function agentAuthed(req) {
  if (!cfg.AGENT_TOKEN_SHA256) return false;
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!t) return false;
  const h = crypto.createHash('sha256').update(t).digest();
  const want = Buffer.from(cfg.AGENT_TOKEN_SHA256, 'hex');
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}
app.use('/agent', (req, res, next) => (agentAuthed(req) ? next() : res.status(401).json({ error: 'unauthorized' })));

app.get('/agent/tasks', (_req, res) => {
  lastAgentVisit = new Date().toISOString();
  res.json({ now: lastAgentVisit, tasks: engine.agentTasks() });
});

app.post('/agent/result', async (req, res) => {
  try {
    const c = await engine.applyAgentResult(req.body || {});
    res.json({ ok: true, caseId: c.id, stage: c.stage, restricted: c.restrictedSections || [] });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Startup-style diagnostics, reachable from the phone: which pieces are actually wired up.
app.get('/api/status', guard, async (_req, res) => {
  const out = {
    pollMinutes: cfg.POLL_MINUTES,
    hrSenders: cfg.HR_SENDERS,
    anthropic: ai.ready(),
    driveFolder: cfg.DRIVE_FOLDER_ID || null,
    routine: { configured: !!cfg.AGENT_TOKEN_SHA256, lastVisit: lastAgentVisit, queued: engine.agentTasks().length },
    health: engine.healthSummary(),
  };
  try { out.mailbox = await g.profile(); } catch (e) { out.mailboxError = e.message; }
  out.drive = await g.checkDrive();
  res.json(out);
});

// Kept off /api/status because it starts Chromium, which takes seconds; status is fetched
// every time the app opens. Asked for on demand, when something looks wrong with a PDF.
app.get('/api/status/render', guard, async (_req, res) => res.json(await render.selfTest()));

// Everything filed, for the question "how many exit interviews have we done". Read from
// Drive, so it covers the ones handled before this app existed.
// Records an interview that was held and written up outside the app.
// Throws away a case that was never a resignation. Refused once a record exists.
// Adds a case for an interview filed before the app existed, so the list and the
// register agree on how many there have been.
app.post('/api/cases', guard, (req, res) => {
  try { res.json(engine.backfill(req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/cases/:id', guard, (req, res) => {
  try { res.json(engine.discard(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/cases/:id/filed', guard, async (req, res) => {
  try { res.json(await engine.markFiled(req.params.id, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/register', guard, async (_req, res) => {
  try { res.json(await engine.register()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/cases', guard, (_req, res) => res.json({ cases: engine.summary() }));

app.get('/api/cases/:id', guard, (req, res) => {
  const c = store.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});

// Lets the interviewer correct what the model read out of the HR email - a missing or
// mistyped leaver address is the most likely thing to need fixing before an invite goes.
app.post('/api/cases/:id/details', guard, (req, res) => {
  const c = store.get(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const { name, email, role } = req.body || {};
  const leaver = { ...c.leaver };
  if (name) leaver.name = name;
  if (email !== undefined) leaver.email = email;
  if (role !== undefined) leaver.role = role;
  res.json(store.update(c.id, { leaver }));
});

app.post('/api/cases/:id/invite', guard, async (req, res) => {
  try {
    const { startIso, durationMinutes } = req.body || {};
    if (!startIso) return res.status(400).json({ error: 'startIso required' });
    res.json(await engine.sendInvite(req.params.id, { startIso, durationMinutes }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/cases/:id/draft', guard, async (req, res) => {
  try { res.json(await engine.draft(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Correcting the wording before it is filed. Re-renders, so the PDF behind "Read the
// draft" is always what would be sent.
app.post('/api/cases/:id/record', guard, async (req, res) => {
  try { res.json(await engine.editRecord(req.params.id, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/cases/:id/publish', guard, async (req, res) => {
  try { res.json(await engine.publish(req.params.id, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Preview before sending. Inline so it opens in the phone's PDF viewer rather than
// downloading - the point is to actually read it.
app.get('/api/cases/:id/pdf', guard, (req, res) => {
  const p = store.pdfPath(req.params.id);
  if (!fs.existsSync(p)) return res.status(404).send('No PDF yet');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="record.pdf"');
  fs.createReadStream(p).pipe(res);
});

app.post('/api/cases/:id/dismiss', guard, (req, res) => {
  try { res.json(engine.dismiss(req.params.id, (req.body || {}).reason)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/cases/:id/reopen', guard, (req, res) => {
  try { res.json(engine.reopen(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/cases/:id/html', guard, (req, res) => {
  const p = store.htmlPath(req.params.id);
  if (!fs.existsSync(p)) return res.status(404).send('No draft yet');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  fs.createReadStream(p).pipe(res);
});

app.post('/api/poll', guard, async (_req, res) => {
  try { res.json(await engine.pollAll()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

store.ensure();

// Only bind a port and start polling when this file is the thing being run. Required as a
// module - by the tests - it is just the app, so the HTTP behaviour can be exercised
// without a live server racing a poll against Gmail.
if (require.main === module) {
  app.listen(cfg.PORT, () => {
    console.log(`exit-interview-agent on :${cfg.PORT}`);
    setTimeout(() => engine.pollAll().catch(e => console.error('poll', e.message)), 5000);
    setInterval(() => engine.pollAll().catch(e => console.error('poll', e.message)), cfg.POLL_MINUTES * 60000);
  });
}

module.exports = app;
