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

// Serve the web page
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'people-analyzer', 'index.html'));
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
    if (!existing) {
      await logbook.createAccount(name, auth.hashPin(pin));
      await logbook.ensureUserTab(name);
      isNew = true;
    } else if (!auth.verifyPin(pin, existing.pinHash)) {
      return res.status(401).json({ ok: false, error: 'Wrong PIN for this name' });
    }
    res.json({ ok: true, token: auth.makeToken(name), name, isNew });
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

module.exports = router;
