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

function authed(req) {
  if (!cfg.APP_PIN) return true;
  return samePin(req.get('x-pin') || req.query.pin || '', cfg.APP_PIN);
}

function guard(req, res, next) {
  if (!cfg.APP_PIN) return next();
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
