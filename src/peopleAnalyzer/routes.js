// Express router for the People Analyzer Logbook web app. Mounted at /pa.
const express = require('express');
const multer = require('multer');
const path = require('path');
const logger = require('../logger');
const logbook = require('./logbook');
const { transcribeAudio } = require('./transcribe');
const { generateAssessment } = require('./generate');
const { translateToEnglish, guessCategory } = require('./translate');
const auth = require('./auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Auth middleware — derive the user from the signed token (NOT from client input).
function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const name = auth.verifyToken(token);
  if (!name) return res.status(401).json({ ok: false, error: 'Please log in again' });
  req.userName = name;
  next();
}

// Admin middleware — allow only super_admin / admin.
async function requireAdmin(req, res, next) {
  try {
    const acc = await logbook.getAccount(req.userName);
    if (!acc || !['super_admin', 'admin'].includes(acc.role)) {
      return res.status(403).json({ ok: false, error: 'Admins only' });
    }
    req.role = acc.role;
    next();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

// Serve the web page
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'people-analyzer', 'index.html'));
});

// ─── Email + password sign-in (2026-10-26) ───────────────────────────────────
// Same Raftar account as the fleet dashboard and Exit Interviews; the password is
// checked by the meter-reading service. An owner email maps to its existing named
// account here (role, skills and logbook kept). Everyone else signs in under their
// email, as a user whose skills follow the access given on the Users page.
const OWNER_NAMES = (() => {
  try { return JSON.parse(process.env.OPS_OWNER_NAMES || '{}'); } catch { return {}; }
})();
if (!Object.keys(OWNER_NAMES).length) OWNER_NAMES['tahir.saleem@niete.edu.pk'] = 'Tahir Saleem';
const emailOfName = name => (name.includes('@') ? name : Object.keys(OWNER_NAMES).find(e => OWNER_NAMES[e] === name));
const skillsFromApps = apps => (apps || []).filter(a => a === 'meter' || a === 'exit').join(',');

router.post('/api/login-email', async (req, res) => {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const password = String((req.body || {}).password || '');
    if (!email || !password) return res.status(400).json({ ok: false, error: 'Enter your email and password' });
    if (!process.env.METER_ADMIN_KEY) return res.status(503).json({ ok: false, error: 'Sign-in is not set up' });
    const v = await meter('/api/dashboard-users/verify', { method: 'POST', body: JSON.stringify({ email, password, app: 'any' }) });
    if (!v.ok) {
      logger.warn(`[pa] email sign-in failed for "${email}" (${v.reason || 'bad'})`);
      return res.status(401).json({ ok: false, error: 'Email or password is incorrect.' });
    }
    const name = OWNER_NAMES[email] || email;
    const acc = await logbook.getAccount(name);
    const role = acc ? acc.role : 'user';
    const skills = acc ? acc.skills : skillsFromApps(v.apps);
    res.json({ ok: true, token: auth.makeToken(name), name: acc ? acc.name : name, role, skills, mustChange: !!v.mustChange });
  } catch (e) {
    logger.error('[pa] email login error: ' + e.message);
    res.status(502).json({ ok: false, error: 'Sign-in service is not reachable. Try again in a minute.' });
  }
});

// "Set your own password" after signing in with the emailed one (meter-reading re-checks it)
router.post('/api/change-password', requireAuth, async (req, res) => {
  try {
    const email = emailOfName(req.userName);
    if (!email) return res.status(400).json({ ok: false, error: 'This account signs in with a PIN' });
    const { current = '', newpw = '' } = req.body || {};
    const r = await meter('/api/dashboard-users/change-password', { method: 'POST', body: JSON.stringify({ email, current: String(current), newpw: String(newpw) }) });
    res.status(r.ok ? 200 : 400).json(r.ok ? { ok: true } : { ok: false, error: r.error || 'Could not change the password' });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'Sign-in service is not reachable. Try again in a minute.' });
  }
});

// Who am I (name + role) — used by the UI after login/refresh.
router.get('/api/me', requireAuth, async (req, res) => {
  try {
    const acc = await logbook.getAccount(req.userName);
    if (!acc && req.userName.includes('@')) {
      // email user: skills follow their current access, and removal signs them out
      const r = await meter('/api/dashboard-users/' + encodeURIComponent(req.userName) + '/apps');
      if (!r.apps || !r.apps.length) return res.status(401).json({ ok: false, error: 'Please log in again' });
      return res.json({ ok: true, name: req.userName, role: 'user', skills: skillsFromApps(r.apps) });
    }
    res.json({ ok: true, name: req.userName, role: acc ? acc.role : 'user', skills: acc ? acc.skills : '' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Login / register ─────────────────────────────────────────────────────────
// First time a name is used, the PIN is set (register). Afterwards it must match.
router.post('/api/login', async (req, res) => {
  try {
    let { name, pin } = req.body || {};
    name = (name || '').trim();
    pin = (pin || '').trim();
    if (!name) return res.status(400).json({ ok: false, error: 'Name required' });
    if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ ok: false, error: 'PIN must be 4-8 digits' });

    const existing = await logbook.getAccount(name);
    let isNew = false;
    let role = existing ? existing.role : 'user';
    let skills = existing ? existing.skills : '';
    if (!existing) {
      // First account ever becomes super_admin (bootstrap).
      const count = await logbook.countAccounts();
      role = count === 0 ? 'super_admin' : 'user';
      skills = role === 'user' ? 'pa' : '';
      await logbook.createAccount(name, auth.hashPin(pin), role, skills);
      await logbook.ensureUserTab(name);
      isNew = true;
    } else if (!auth.verifyPin(pin, existing.pinHash)) {
      return res.status(401).json({ ok: false, error: 'Wrong PIN for this name' });
    }
    res.json({ ok: true, token: auth.makeToken(name), name, role, skills, isNew });
  } catch (e) {
    logger.error('[pa] login error: ' + e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Translate raw speech text (Urdu/English) -> clean English (free, no API key).
router.post('/api/translate', requireAuth, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ ok: false, error: 'No text' });
    const entry = await translateToEnglish(text);
    res.json({ ok: true, entry, category: guessCategory(entry) });
  } catch (e) {
    logger.error('[pa] translate error: ' + e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Optional: transcribe an uploaded audio file via Gemini (fallback; needs quota).
router.post('/api/transcribe', requireAuth, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No audio uploaded' });
    const mime = req.file.mimetype && req.file.mimetype.startsWith('audio/') ? req.file.mimetype : 'audio/wav';
    const result = await transcribeAudio(req.file.buffer, mime);
    res.json({ ok: true, ...result });
  } catch (e) {
    logger.error('[pa] transcribe error: ' + e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Save an entry — user comes from the token, so users can only write to their own tab.
router.post('/api/save', requireAuth, async (req, res) => {
  try {
    const { entry, category, date } = req.body || {};
    if (!entry || !entry.trim()) return res.status(400).json({ ok: false, error: 'Entry text required' });
    const saved = await logbook.appendEntry({ user: req.userName, entry: entry.trim(), category: category || '', date });
    res.json({ ok: true, saved });
  } catch (e) {
    logger.error('[pa] save error: ' + e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Get the logged-in user's own entries.
router.get('/api/entries', requireAuth, async (req, res) => {
  try {
    const { cycle } = req.query;
    const entries = await logbook.getEntries(req.userName, cycle);
    const cycles = await logbook.listCycles(req.userName);
    res.json({ ok: true, entries, cycles, currentCycle: logbook.cycleLabel() });
  } catch (e) {
    logger.error('[pa] entries error: ' + e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Generate the assessment from the logged-in user's entries.
router.post('/api/generate', requireAuth, async (req, res) => {
  try {
    const { cycle } = req.body || {};
    const entries = await logbook.getEntries(req.userName, cycle);
    if (!entries.length) return res.status(400).json({ ok: false, error: 'No entries found for this cycle' });
    const assessment = await generateAssessment(entries);
    res.json({ ok: true, ...assessment, cycle: cycle || 'all' });
  } catch (e) {
    logger.error('[pa] generate error: ' + e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Admin: user management (super_admin / admin only) ────────────────────────

// List all users with their roles.
router.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    res.json({ ok: true, users: await logbook.listAccounts(), myRole: req.role });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Add a new user with an initial PIN and role.
router.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    let { name, pin, role, skills } = req.body || {};
    name = (name || '').trim();
    pin = (pin || '').trim();
    role = (role || 'user').trim();
    if (!name) return res.status(400).json({ ok: false, error: 'Name required' });
    if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ ok: false, error: 'PIN must be 4-8 digits' });
    if (!['user', 'admin', 'super_admin'].includes(role)) role = 'user';
    // Only super_admin can create admins / super_admins.
    if (role !== 'user' && req.role !== 'super_admin') {
      return res.status(403).json({ ok: false, error: 'Only a Super Admin can assign admin roles' });
    }
    // Normalise assigned skills (default People Analyzer).
    const ALLOWED = ['pa', 'meter', 'exit'];
    let skillsArr = Array.isArray(skills) ? skills : (typeof skills === 'string' ? skills.split(',') : []);
    skillsArr = skillsArr.map(s => String(s).trim()).filter(s => ALLOWED.includes(s));
    if (!skillsArr.length) skillsArr = ['pa'];
    const skillsStr = skillsArr.join(',');
    if (await logbook.getAccount(name)) return res.status(409).json({ ok: false, error: 'That name already exists' });
    await logbook.createAccount(name, auth.hashPin(pin), role, skillsStr);
    await logbook.ensureUserTab(name);
    res.json({ ok: true, name, role, skills: skillsStr });
  } catch (e) {
    logger.error('[pa] add-user error: ' + e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Change a user's role — super_admin only.
router.post('/api/admin/set-role', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (req.role !== 'super_admin') return res.status(403).json({ ok: false, error: 'Only a Super Admin can change roles' });
    let { name, role } = req.body || {};
    name = (name || '').trim();
    role = (role || '').trim();
    if (!['user', 'admin', 'super_admin'].includes(role)) return res.status(400).json({ ok: false, error: 'Invalid role' });
    if (name.toLowerCase() === req.userName.toLowerCase()) return res.status(400).json({ ok: false, error: "You can't change your own role" });
    const ok = await logbook.setRole(name, role);
    if (!ok) return res.status(404).json({ ok: false, error: 'User not found' });
    res.json({ ok: true, name, role });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Change which skills a user can see — super_admin only.
router.post('/api/admin/set-skills', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (req.role !== 'super_admin') return res.status(403).json({ ok: false, error: 'Only a Super Admin can change skills' });
    let { name, skills } = req.body || {};
    name = (name || '').trim();
    const ALLOWED = ['pa', 'meter', 'exit'];
    let arr = Array.isArray(skills) ? skills : (typeof skills === 'string' ? skills.split(',') : []);
    arr = arr.map(s => String(s).trim()).filter(s => ALLOWED.includes(s));
    if (!arr.length) return res.status(400).json({ ok: false, error: 'Select at least one skill' });
    const ok = await logbook.setSkills(name, arr.join(','));
    if (!ok) return res.status(404).json({ ok: false, error: 'User not found' });
    res.json({ ok: true, name, skills: arr.join(',') });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Remove a user's login — super_admin only; never yourself or another Super Admin.
router.post('/api/admin/remove-user', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (req.role !== 'super_admin') return res.status(403).json({ ok: false, error: 'Only a Super Admin can remove users' });
    const name = String((req.body || {}).name || '').trim();
    if (!name) return res.status(400).json({ ok: false, error: 'Name required' });
    if (name.toLowerCase() === String(req.userName).toLowerCase()) return res.status(400).json({ ok: false, error: 'You cannot remove your own account' });
    const acc = await logbook.getAccount(name);
    if (!acc) return res.status(404).json({ ok: false, error: 'User not found' });
    if (acc.role === 'super_admin') return res.status(400).json({ ok: false, error: 'Change their role first — a Super Admin cannot be removed' });
    await logbook.deleteAccount(name);
    res.json({ ok: true, name: acc.name });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Dashboard access (meter-reading dashboard email logins) ─────────────────
// Super admin only. Proxies to the meter-reading service with the shared key,
// so the key never reaches the browser.
const METER_BASE = process.env.METER_DASHBOARD_BASE || 'https://meter-reading-production-2d7f.up.railway.app';
function requireSuper(req, res, next) {
  if (req.role !== 'super_admin') return res.status(403).json({ ok: false, error: 'Only a Super Admin can manage dashboard access' });
  if (!process.env.METER_ADMIN_KEY) return res.status(503).json({ ok: false, error: 'METER_ADMIN_KEY is not set' });
  next();
}
async function meter(pathname, opts = {}) {
  const r = await fetch(METER_BASE + pathname, {
    ...opts,
    headers: { ...(opts.headers || {}), 'x-admin-key': process.env.METER_ADMIN_KEY, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (r.status === 404) throw new Error('Dashboard service refused the request (key mismatch?)');
  return r.json();
}
// ?app=meter (fleet dashboard, default) or ?app=exit (Exit Interviews) — same accounts, per-app access
const appQ = req => (req.query.app === 'exit' ? 'exit' : 'meter');
router.get('/api/admin/dashboard-users', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  try { res.json(await meter('/api/dashboard-users?app=' + appQ(req))); } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});
router.post('/api/admin/dashboard-users', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    res.json(await meter('/api/dashboard-users?app=' + appQ(req), { method: 'POST', body: JSON.stringify({ email, invitedBy: req.userName }) }));
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});
router.delete('/api/admin/dashboard-users/:email', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  try { res.json(await meter('/api/dashboard-users/' + encodeURIComponent(req.params.email) + '?app=' + appQ(req), { method: 'DELETE' })); }
  catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

// ─── Users page: one list, one "Add user" (email + ticks), one email per person ──
const appsOf = body => (Array.isArray((body || {}).apps) ? body.apps.filter(a => a === 'meter' || a === 'exit') : []);
router.get('/api/admin/raftar-users', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  try { res.json(await meter('/api/raftar-users')); } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});
router.post('/api/admin/raftar-users', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    res.json(await meter('/api/dashboard-users', { method: 'POST', body: JSON.stringify({ email, apps: appsOf(req.body), invitedBy: req.userName }) }));
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});
router.post('/api/admin/raftar-users/:email/apps', requireAuth, requireAdmin, requireSuper, async (req, res) => {
  try { res.json(await meter('/api/raftar-users/' + encodeURIComponent(req.params.email) + '/apps', { method: 'POST', body: JSON.stringify({ apps: appsOf(req.body) }) })); }
  catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});

module.exports = router;
