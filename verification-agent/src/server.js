// HTTP server: PIN-protected mobile app + JSON API. Background poll every POLL_MINUTES.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cfg = require('./config');
const store = require('./store');
const engine = require('./engine');
const markaz = require('./markaz');
const ai = require('./ai');
const gmail = require('./gmail');

store.load();
const st = store.get();
if (!st.cases.length && fs.existsSync(path.join(__dirname, '..', 'seed.json'))) {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed.json'), 'utf8'));
  for (const s of seed) st.cases.push({ id: String(st.seq++), createdAt: new Date().toISOString(), archived: false, cv: null, log: [], ...s,
    contact: { seenIds: [], analysedIds: [], ...s.contact }, orgs: (s.orgs || []).map(o => ({ seenIds: [], ...o })) });
  store.save();
  console.log(`Seeded ${seed.length} existing cases`);
}

const app = express();
app.use(express.json({ limit: '20mb' }));
app.set('trust proxy', 1);

// ---------- PIN login ----------
const attempts = new Map();
const cookieOf = req => Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=')));
function authed(req) {
  const t = cookieOf(req).va_session;
  const s = t && st.sessions[t];
  return !!s && s.exp > Date.now();
}
app.post('/api/login', (req, res) => {
  const ip = req.ip;
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 3600e3) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return res.status(429).json({ error: 'Too many attempts — try again in an hour' });
  const pin = String(req.body?.pin || '');
  const ok = cfg.APP_PIN.length >= 6 && pin.length === cfg.APP_PIN.length && crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(cfg.APP_PIN));
  if (!ok) { a.n++; attempts.set(ip, a); return res.status(401).json({ error: 'Wrong PIN' }); }
  const token = crypto.randomBytes(32).toString('hex');
  st.sessions[token] = { exp: Date.now() + 30 * 86400e3 };
  for (const [k, v] of Object.entries(st.sessions)) if (v.exp < Date.now()) delete st.sessions[k];
  store.save();
  res.setHeader('Set-Cookie', `va_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 86400}`);
  res.json({ ok: true });
});
app.get('/health', (req, res) => res.json({ ok: true }));

// ---------- hourly Claude Code routine (bearer token; only its SHA-256 is stored) ----------
function agentAuthed(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!t) return false;
  const h = crypto.createHash('sha256').update(t).digest();
  const want = Buffer.from(cfg.AGENT_TOKEN_SHA256, 'hex');
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}
app.use('/agent', (req, res, next) => (agentAuthed(req) ? next() : res.status(401).json({ error: 'unauthorized' })));
app.get('/agent/tasks', (req, res) => { st.lastAgentVisit = new Date().toISOString(); res.json({ now: new Date().toISOString(), tasks: engine.agentTasks() }); });
app.get('/agent/file/cv/:id', (req, res) => {
  const c = store.caseById(req.params.id); const f = c && engine.cvFile(c);
  if (!f) return res.status(404).json({ error: 'no CV' });
  res.type(f.mime).send(fs.readFileSync(f.path));
});
app.get('/agent/file/att/:id/:msgId/:filename', async (req, res) => {
  try {
    const c = store.caseById(req.params.id);
    if (!c?.pendingReplies?.replies.some(r => r.msgId === req.params.msgId)) return res.status(404).json({ error: 'not a pending reply of this case' });
    const a = await gmail.attachmentFile(req.params.msgId, req.params.filename);
    res.type(a.mime).send(a.buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/agent/result', async (req, res) => {
  try { const c = await engine.applyAgentResult(req.body || {}); res.json({ ok: true, stage: engine.summary(c).stage }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.use('/api', (req, res, next) => (authed(req) ? next() : res.status(401).json({ error: 'login' })));

const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (e) { console.error(e); res.status(500).json({ error: e.message }); } };
const getCase = req => { const c = store.caseById(req.params.id); if (!c) throw new Error('Case not found'); return c; };
const view = c => ({ ...c, summary: engine.summary(c) });
const bg = c => setImmediate(() => engine.processCase(c));

// ---------- API ----------
app.get('/api/status', wrap(async (req, res) => {
  let gmailOk = null;
  try { await gmail.verifyAccount(); gmailOk = true; } catch (e) { gmailOk = e.message; }
  res.json({ aiReady: ai.ready(), gmail: gmailOk, markaz: !!process.env.MARKAZ_EMAIL, lastPoll: st.lastPoll, cc: cfg.CC, reminderDays: cfg.REMINDER_DAYS });
}));
app.get('/api/search', wrap(async (req, res) => res.json(await markaz.search(String(req.query.q || '')))));
app.get('/api/cases', wrap(async (req, res) => res.json(st.cases.filter(c => req.query.all || !c.archived)
  .map(c => ({ id: c.id, name: c.name, archived: c.archived, createdAt: c.createdAt, position: c.markaz?.position, busy: c.busy, error: c.error, summary: engine.summary(c) })))));
app.get('/api/cases/:id', wrap(async (req, res) => res.json(view(getCase(req)))));

app.post('/api/cases', wrap(async (req, res) => {
  const sel = req.body || {};
  if (!sel.name) throw new Error('Name required');
  const dup = st.cases.find(c => !c.archived && ((sel.candidateId && c.markaz?.candidateId === sel.candidateId) || c.name.toLowerCase() === sel.name.toLowerCase()));
  if (dup) return res.json(view(dup));
  const c = engine.createCase(sel);
  bg(c);
  res.json(view(c));
}));
app.patch('/api/cases/:id', wrap(async (req, res) => {
  const c = getCase(req);
  if (req.body.employeeEmail !== undefined) c.employeeEmail = req.body.employeeEmail.trim();
  if (req.body.archived !== undefined) c.archived = !!req.body.archived;
  store.save(); res.json(view(c));
}));
app.post('/api/cases/:id/cv', wrap(async (req, res) => {
  const c = getCase(req);
  engine.saveUploadedCv(c, req.body.mime, req.body.data);
  store.save(); bg(c); res.json(view(c));
}));
app.post('/api/cases/:id/refresh', wrap(async (req, res) => { const c = getCase(req); await engine.processCase(c); res.json(view(c)); }));
app.post('/api/cases/:id/contact/send', wrap(async (req, res) => {
  const c = getCase(req);
  await engine.sendContact(c, req.body?.to); store.save(); res.json(view(c));
}));
app.post('/api/cases/:id/orgs/:key/send', wrap(async (req, res) => {
  const c = getCase(req);
  await engine.sendOrg(c, req.params.key, req.body || {}); store.save(); res.json(view(c));
}));
app.post('/api/cases/:id/orgs/:key/preview', wrap(async (req, res) => {
  const c = getCase(req); const row = c.orgs.find(r => r.key === req.params.key);
  if (!row || !['draft', 'error'].includes(row.status)) throw new Error('Not a draft');
  if (req.body.toName !== undefined) row.toName = req.body.toName || null;
  if (req.body.to) { row.to = req.body.to.trim().toLowerCase(); row.contactFromCandidate = row.to === (row.contact_email || '').toLowerCase(); }
  engine.renderOrgDraft(c, row); store.save(); res.json(view(c));
}));
app.post('/api/cases/:id/orgs/:key/skip', wrap(async (req, res) => {
  const c = getCase(req); const row = c.orgs.find(r => r.key === req.params.key);
  if (row) { row.status = row.status === 'skipped' ? 'draft' : 'skipped'; store.log(c, `${row.organization}: ${row.status === 'skipped' ? 'skipped' : 'restored'}`); }
  store.save(); res.json(view(c));
}));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use((req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

for (const c of st.cases) c.busy = false;
app.listen(cfg.PORT, () => {
  console.log(`verification-agent on :${cfg.PORT} — AI ${ai.ready() ? 'ready' : 'MISSING KEY'}, PIN ${cfg.APP_PIN ? 'set' : 'MISSING'}`);
  setTimeout(() => engine.pollAll().catch(e => console.error('poll', e)), 5000);
  setInterval(() => engine.pollAll().catch(e => console.error('poll', e)), cfg.POLL_MINUTES * 60e3);
});
