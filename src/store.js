// Case state on the Railway volume. One JSON file; the volume of exit interviews is a
// handful a month, so a database would be more moving parts than the job needs.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const FILE = path.join(cfg.DATA_DIR, 'cases.json');
const PDF_DIR = path.join(cfg.DATA_DIR, 'pdf');

function ensure() {
  fs.mkdirSync(cfg.DATA_DIR, { recursive: true });
  fs.mkdirSync(PDF_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ cases: [], seenIds: [] }, null, 2));
}

function read() {
  ensure();
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { cases: [], seenIds: [] }; }
}

function write(db) {
  ensure();
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

const all = () => read().cases;
const get = id => read().cases.find(c => c.id === id) || null;

function save(updated) {
  const db = read();
  const i = db.cases.findIndex(c => c.id === updated.id);
  if (i === -1) db.cases.unshift(updated); else db.cases[i] = updated;
  write(db);
  return updated;
}

function update(id, patch) {
  const c = get(id);
  if (!c) throw new Error('No such case: ' + id);
  return save({ ...c, ...patch, updatedAt: new Date().toISOString() });
}

function log(id, line) {
  const c = get(id);
  if (!c) return;
  const entries = (c.log || []).concat([{ at: new Date().toISOString(), line }]);
  save({ ...c, log: entries.slice(-60) });
}

// Message ids we have already turned into cases, so a second poll over the same HR email
// does not open a duplicate.
function seen(messageId) { return read().seenIds.includes(messageId); }
function markSeen(messageId) {
  const db = read();
  if (!db.seenIds.includes(messageId)) db.seenIds.push(messageId);
  db.seenIds = db.seenIds.slice(-500);
  write(db);
}

const pdfPath = id => path.join(PDF_DIR, `${id}.pdf`);
const htmlPath = id => path.join(PDF_DIR, `${id}.html`);

module.exports = { all, get, save, update, log, seen, markSeen, pdfPath, htmlPath, ensure };
