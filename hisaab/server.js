// Dostab — friends expense splitter.
// All money is stored as integer paisa so totals never drift.
// Debts are tracked pair by pair (who owes whom directly), so "Tahir owes Zeshan" is always exact.
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'hisaab.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, phone TEXT,
  pass_hash TEXT, salt TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, invite_code TEXT UNIQUE NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members (
  group_id INTEGER NOT NULL REFERENCES groups(id), user_id INTEGER NOT NULL REFERENCES users(id),
  joined_at TEXT NOT NULL, PRIMARY KEY (group_id, user_id));
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES groups(id), description TEXT NOT NULL,
  amount INTEGER NOT NULL, paid_by INTEGER NOT NULL REFERENCES users(id), date TEXT NOT NULL,
  split_type TEXT NOT NULL, created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, updated_at TEXT, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS expense_shares (
  expense_id INTEGER NOT NULL REFERENCES expenses(id), user_id INTEGER NOT NULL REFERENCES users(id),
  share INTEGER NOT NULL, PRIMARY KEY (expense_id, user_id));
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES groups(id),
  from_user INTEGER NOT NULL REFERENCES users(id), to_user INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL, date TEXT NOT NULL, note TEXT, created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES groups(id),
  user_id INTEGER NOT NULL REFERENCES users(id), text TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES groups(id),
  from_user INTEGER NOT NULL REFERENCES users(id), to_user INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL, created_at TEXT NOT NULL, seen_at TEXT);
`);

const now = () => new Date().toISOString();
const q = (sql) => db.prepare(sql);

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (msg) => { throw new HttpError(400, msg); };

// ---------- money ----------
function parseAmount(v, field = 'Amount') {
  const s = String(v ?? '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) bad(`${field} must be a valid number (max 2 decimals)`);
  const [r, p = ''] = s.split('.');
  const paisa = Number(r) * 100 + Number((p + '00').slice(0, 2));
  if (!Number.isSafeInteger(paisa) || paisa > 100_000_000_00) bad(`${field} is too large`);
  return paisa;
}
function fmt(paisa) {
  const neg = paisa < 0; const a = Math.abs(paisa);
  const r = Math.floor(a / 100), p = a % 100;
  return (neg ? '-' : '') + 'Rs ' + r.toLocaleString('en-PK') + (p ? '.' + String(p).padStart(2, '0') : '');
}
// Equal split: remainder paisa go one each to the first participants (payer first),
// so shares always add up exactly to the total.
function equalShares(amount, ids, payer) {
  const ordered = [...ids].sort((a, b) => (a === payer ? -1 : b === payer ? 1 : a - b));
  const base = Math.floor(amount / ordered.length), rem = amount - base * ordered.length;
  return ordered.map((id, i) => ({ user_id: id, share: base + (i < rem ? 1 : 0) }));
}

// ---------- auth ----------
const hashPass = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function newSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  q('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)').run(token, userId, now());
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 180 });
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use((req, _res, next) => {
  const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (m) req.user = q('SELECT u.id, u.email, u.name, u.phone FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(m[1]);
  req.sid = m && m[1];
  next();
});
const auth = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'Please log in')));
const wrap = (fn) => (req, res, next) => { try { const r = fn(req, res); if (r !== undefined) res.json(r); } catch (e) { next(e); } };

const userPublic = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone || null, registered: !!u.pass_hash });
const cleanPhone = (p) => String(p || '').replace(/[^\d+]/g, '') || null;

app.post('/api/signup', wrap((req, res) => {
  const email = normEmail(req.body.email), name = String(req.body.name || '').trim(), pw = String(req.body.password || '');
  if (name.length < 2 || name.length > 40) bad('Name must be 2–40 characters');
  if (!validEmail(email)) bad('Please enter a valid email');
  if (pw.length < 6) bad('Password must be at least 6 characters');
  const salt = crypto.randomBytes(16).toString('hex'), hash = hashPass(pw, salt);
  const existing = q('SELECT * FROM users WHERE email = ?').get(email);
  let id;
  if (existing) {
    // A friend added this email to a group before they signed up — let them claim it.
    if (existing.pass_hash) bad('An account with this email already exists — please log in');
    q('UPDATE users SET name = ?, pass_hash = ?, salt = ?, phone = ? WHERE id = ?').run(name, hash, salt, cleanPhone(req.body.phone) || existing.phone, existing.id);
    id = existing.id;
  } else {
    id = Number(q('INSERT INTO users (email, name, phone, pass_hash, salt, created_at) VALUES (?,?,?,?,?,?)')
      .run(email, name, cleanPhone(req.body.phone), hash, salt, now()).lastInsertRowid);
  }
  newSession(res, id);
  return { ok: true };
}));

app.post('/api/login', wrap((req, res) => {
  const u = q('SELECT * FROM users WHERE email = ?').get(normEmail(req.body.email));
  if (!u || !u.pass_hash) throw new HttpError(401, u ? 'No password set for this email yet — please sign up' : 'Wrong email or password');
  const h = hashPass(String(req.body.password || ''), u.salt);
  if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(u.pass_hash, 'hex'))) throw new HttpError(401, 'Wrong email or password');
  newSession(res, u.id);
  return { ok: true };
}));

app.post('/api/logout', wrap((req, res) => {
  if (req.sid) q('DELETE FROM sessions WHERE token = ?').run(req.sid);
  res.clearCookie('sid');
  return { ok: true };
}));

app.get('/api/me', auth, wrap((req) => {
  const reminders = q(`SELECT r.id, r.amount, r.created_at, r.group_id, g.name AS group_name, u.name AS from_name
    FROM reminders r JOIN groups g ON g.id = r.group_id JOIN users u ON u.id = r.from_user
    WHERE r.to_user = ? AND r.seen_at IS NULL ORDER BY r.id DESC`).all(req.user.id);
  return { user: req.user, reminders };
}));

app.patch('/api/me', auth, wrap((req) => {
  const name = String(req.body.name ?? req.user.name).trim();
  if (name.length < 2 || name.length > 40) bad('Name must be 2–40 characters');
  q('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, cleanPhone(req.body.phone ?? req.user.phone), req.user.id);
  return { ok: true };
}));

app.post('/api/reminders/:id/seen', auth, wrap((req) => {
  q('UPDATE reminders SET seen_at = ? WHERE id = ? AND to_user = ?').run(now(), req.params.id, req.user.id);
  return { ok: true };
}));

// ---------- ledger ----------
function memberOf(req) {
  const g = q('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  if (!g || !q('SELECT 1 FROM members WHERE group_id = ? AND user_id = ?').get(g.id, req.user.id)) throw new HttpError(404, 'Group not found');
  return g;
}
const memberIds = (gid) => q('SELECT user_id FROM members WHERE group_id = ?').all(gid).map((r) => r.user_id);
const nameOf = (uid) => q('SELECT name FROM users WHERE id = ?').get(uid)?.name || '?';
const log = (gid, uid, text) => q('INSERT INTO activity (group_id, user_id, text, created_at) VALUES (?,?,?,?)').run(gid, uid, text, now());

// Direct debts inside one group: [{from, to, amount}] where `from` owes `to`.
// Each participant owes the payer their share; payments reduce that. Opposite debts between
// the same two people cancel out, nothing is routed through a third person.
function pairDebts(gid) {
  const owe = new Map(); // "a:b" -> amount a owes b (a < b; negative means b owes a)
  const add = (a, b, v) => {
    if (a === b) return;
    const [x, y, s] = a < b ? [a, b, 1] : [b, a, -1];
    owe.set(`${x}:${y}`, (owe.get(`${x}:${y}`) || 0) + s * v);
  };
  for (const e of q('SELECT id, paid_by FROM expenses WHERE group_id = ? AND deleted_at IS NULL').all(gid))
    for (const s of q('SELECT user_id, share FROM expense_shares WHERE expense_id = ?').all(e.id)) add(s.user_id, e.paid_by, s.share);
  for (const p of q('SELECT from_user, to_user, amount FROM payments WHERE group_id = ? AND deleted_at IS NULL').all(gid))
    add(p.from_user, p.to_user, -p.amount);
  const out = [];
  for (const [k, v] of owe) {
    if (!v) continue;
    const [x, y] = k.split(':').map(Number);
    out.push(v > 0 ? { from: x, to: y, amount: v } : { from: y, to: x, amount: -v });
  }
  return out.sort((a, b) => b.amount - a.amount);
}
// Net per member: + means others owe them, − means they owe.
function balances(gid, debts = pairDebts(gid)) {
  const net = new Map(memberIds(gid).map((id) => [id, 0]));
  for (const d of debts) { net.set(d.to, (net.get(d.to) || 0) + d.amount); net.set(d.from, (net.get(d.from) || 0) - d.amount); }
  return net;
}
// What `other` owes `me` in one group (negative = I owe them).
const pairIn = (gid, me, other) => pairDebts(gid).reduce((a, d) =>
  a + (d.from === other && d.to === me ? d.amount : d.from === me && d.to === other ? -d.amount : 0), 0);
const sharedGroups = (a, b) => q(`SELECT g.id, g.name FROM groups g JOIN members m1 ON m1.group_id = g.id AND m1.user_id = ?
  JOIN members m2 ON m2.group_id = g.id AND m2.user_id = ? ORDER BY g.id`).all(a, b);

// ---------- groups ----------
app.get('/api/groups', auth, wrap((req) => {
  return q(`SELECT g.id, g.name, (SELECT COUNT(*) FROM members m2 WHERE m2.group_id = g.id) AS member_count
    FROM groups g JOIN members m ON m.group_id = g.id WHERE m.user_id = ? ORDER BY g.id DESC`).all(req.user.id)
    .map((g) => ({ ...g, my_balance: balances(g.id).get(req.user.id) || 0 }));
}));

app.post('/api/groups', auth, wrap((req) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 2 || name.length > 50) bad('Group name must be 2–50 characters');
  return tx(() => {
    const id = Number(q('INSERT INTO groups (name, invite_code, created_by, created_at) VALUES (?,?,?,?)')
      .run(name, crypto.randomBytes(6).toString('base64url'), req.user.id, now()).lastInsertRowid);
    q('INSERT INTO members (group_id, user_id, joined_at) VALUES (?,?,?)').run(id, req.user.id, now());
    log(id, req.user.id, `${req.user.name} created the group "${name}"`);
    return { id };
  });
}));

app.get('/api/groups/:id', auth, wrap((req) => {
  const g = memberOf(req);
  const members = q('SELECT u.* FROM members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.joined_at, u.id').all(g.id).map(userPublic);
  const expenses = q('SELECT * FROM expenses WHERE group_id = ? AND deleted_at IS NULL ORDER BY date DESC, id DESC').all(g.id)
    .map((e) => ({ ...e, shares: q('SELECT user_id, share FROM expense_shares WHERE expense_id = ?').all(e.id) }));
  const payments = q('SELECT * FROM payments WHERE group_id = ? AND deleted_at IS NULL ORDER BY date DESC, id DESC').all(g.id);
  const debts = pairDebts(g.id);
  return {
    group: { id: g.id, name: g.name, invite_code: g.invite_code, created_by: g.created_by },
    members, expenses, payments,
    balances: Object.fromEntries(balances(g.id, debts)),
    debts,
    total_spent: expenses.reduce((a, e) => a + e.amount, 0),
    activity: q('SELECT * FROM activity WHERE group_id = ? ORDER BY id DESC LIMIT 100').all(g.id),
  };
}));

app.patch('/api/groups/:id', auth, wrap((req) => {
  const g = memberOf(req);
  const name = String(req.body.name || '').trim();
  if (name.length < 2 || name.length > 50) bad('Group name must be 2–50 characters');
  q('UPDATE groups SET name = ? WHERE id = ?').run(name, g.id);
  log(g.id, req.user.id, `${req.user.name} renamed the group from "${g.name}" to "${name}"`);
  return { ok: true };
}));

app.post('/api/groups/:id/members', auth, wrap((req) => {
  const g = memberOf(req);
  const email = normEmail(req.body.email);
  if (!validEmail(email)) bad('Please enter a valid email');
  return tx(() => {
    let u = q('SELECT * FROM users WHERE email = ?').get(email);
    if (!u) {
      const name = String(req.body.name || '').trim() || email.split('@')[0];
      const id = q('INSERT INTO users (email, name, created_at) VALUES (?,?,?)').run(email, name.slice(0, 40), now()).lastInsertRowid;
      u = q('SELECT * FROM users WHERE id = ?').get(id);
    }
    if (q('SELECT 1 FROM members WHERE group_id = ? AND user_id = ?').get(g.id, u.id)) bad(`${u.name} is already in this group`);
    q('INSERT INTO members (group_id, user_id, joined_at) VALUES (?,?,?)').run(g.id, u.id, now());
    log(g.id, req.user.id, `${req.user.name} added ${u.name} (${u.email})`);
    return { member: userPublic(u) };
  });
}));

app.delete('/api/groups/:id/members/:uid', auth, wrap((req) => {
  const g = memberOf(req);
  const uid = Number(req.params.uid);
  if (uid !== req.user.id && g.created_by !== req.user.id) throw new HttpError(403, 'Only the group creator can remove other members');
  if (pairDebts(g.id).some((d) => d.from === uid || d.to === uid)) bad('Settle up first — this member still owes or is owed money');
  q('DELETE FROM members WHERE group_id = ? AND user_id = ?').run(g.id, uid);
  log(g.id, req.user.id, uid === req.user.id ? `${req.user.name} left the group` : `${req.user.name} removed ${nameOf(uid)}`);
  return { ok: true };
}));

app.get('/api/join/:code', auth, wrap((req) => {
  const g = q('SELECT id, name FROM groups WHERE invite_code = ?').get(req.params.code);
  if (!g) throw new HttpError(404, 'This invite link is invalid');
  const ids = memberIds(g.id);
  return { id: g.id, name: g.name, member_count: ids.length, already: ids.includes(req.user.id) };
}));
app.post('/api/join/:code', auth, wrap((req) => {
  const g = q('SELECT * FROM groups WHERE invite_code = ?').get(req.params.code);
  if (!g) throw new HttpError(404, 'This invite link is invalid');
  if (!q('SELECT 1 FROM members WHERE group_id = ? AND user_id = ?').get(g.id, req.user.id)) {
    q('INSERT INTO members (group_id, user_id, joined_at) VALUES (?,?,?)').run(g.id, req.user.id, now());
    log(g.id, req.user.id, `${req.user.name} joined via invite link`);
  }
  return { id: g.id };
}));

// ---------- expenses ----------
function readExpense(req, gid) {
  const description = String(req.body.description || '').trim();
  if (!description || description.length > 80) bad('Enter what the expense was for (max 80 characters)');
  const amount = parseAmount(req.body.amount);
  if (amount <= 0) bad('Amount must be more than zero');
  const members = new Set(memberIds(gid));
  const paid_by = Number(req.body.paid_by);
  if (!members.has(paid_by)) bad('The payer is not in this group');
  const date = String(req.body.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) bad('Invalid date');
  const split_type = req.body.split_type === 'exact' ? 'exact' : 'equal';
  let shares;
  if (split_type === 'equal') {
    const ids = [...new Set((req.body.participants || []).map(Number))];
    if (!ids.length) bad('Select at least one person');
    if (ids.some((id) => !members.has(id))) bad('Someone selected is not in this group');
    shares = equalShares(amount, ids, paid_by);
  } else {
    const ex = req.body.exact || {};
    shares = Object.entries(ex).filter(([, v]) => String(v).trim() !== '' && Number(v) !== 0)
      .map(([id, v]) => ({ user_id: Number(id), share: parseAmount(v, `${nameOf(Number(id))}'s share`) }));
    if (!shares.length) bad("Enter each person's share");
    if (shares.some((s) => !members.has(s.user_id))) bad('Someone selected is not in this group');
    const sum = shares.reduce((a, s) => a + s.share, 0);
    if (sum !== amount) bad(`Shares add up to ${fmt(sum)} but the bill is ${fmt(amount)} — off by ${fmt(Math.abs(amount - sum))}`);
  }
  return { description, amount, paid_by, date, split_type, shares };
}
function saveShares(eid, shares) {
  q('DELETE FROM expense_shares WHERE expense_id = ?').run(eid);
  const ins = q('INSERT INTO expense_shares (expense_id, user_id, share) VALUES (?,?,?)');
  for (const s of shares) ins.run(eid, s.user_id, s.share);
}
function getExpense(gid, eid) {
  const e = q('SELECT * FROM expenses WHERE id = ? AND group_id = ? AND deleted_at IS NULL').get(eid, gid);
  if (!e) throw new HttpError(404, 'Expense not found');
  return e;
}

app.post('/api/groups/:id/expenses', auth, wrap((req) => {
  const g = memberOf(req), e = readExpense(req, g.id);
  return tx(() => {
    const id = Number(q('INSERT INTO expenses (group_id, description, amount, paid_by, date, split_type, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(g.id, e.description, e.amount, e.paid_by, e.date, e.split_type, req.user.id, now()).lastInsertRowid);
    saveShares(id, e.shares);
    log(g.id, req.user.id, `${req.user.name} added "${e.description}" — ${fmt(e.amount)} paid by ${nameOf(e.paid_by)}, split between ${e.shares.length}`);
    return { id };
  });
}));

app.put('/api/groups/:id/expenses/:eid', auth, wrap((req) => {
  const g = memberOf(req), old = getExpense(g.id, req.params.eid), e = readExpense(req, g.id);
  return tx(() => {
    q('UPDATE expenses SET description=?, amount=?, paid_by=?, date=?, split_type=?, updated_at=? WHERE id=?')
      .run(e.description, e.amount, e.paid_by, e.date, e.split_type, now(), old.id);
    saveShares(old.id, e.shares);
    const changes = [];
    if (old.description !== e.description) changes.push(`name "${old.description}" → "${e.description}"`);
    if (old.amount !== e.amount) changes.push(`amount ${fmt(old.amount)} → ${fmt(e.amount)}`);
    if (old.paid_by !== e.paid_by) changes.push(`payer ${nameOf(old.paid_by)} → ${nameOf(e.paid_by)}`);
    log(g.id, req.user.id, `${req.user.name} edited "${e.description}"${changes.length ? ': ' + changes.join(', ') : ' (shares changed)'}`);
    return { ok: true };
  });
}));

app.delete('/api/groups/:id/expenses/:eid', auth, wrap((req) => {
  const g = memberOf(req), e = getExpense(g.id, req.params.eid);
  q('UPDATE expenses SET deleted_at = ? WHERE id = ?').run(now(), e.id);
  log(g.id, req.user.id, `${req.user.name} deleted "${e.description}" (${fmt(e.amount)})`);
  return { ok: true };
}));

// ---------- payments (settle up) ----------
function recordPayment(gid, by, from, to, amount, date, note) {
  q('INSERT INTO payments (group_id, from_user, to_user, amount, date, note, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(gid, from, to, amount, date, note, by.id, now());
  log(gid, by.id, `${by.name} recorded: ${nameOf(from)} paid ${nameOf(to)} ${fmt(amount)}${note ? ` (${note})` : ''}`);
}

app.post('/api/groups/:id/payments', auth, wrap((req) => {
  const g = memberOf(req), members = new Set(memberIds(g.id));
  const from = Number(req.body.from_user), to = Number(req.body.to_user);
  if (!members.has(from) || !members.has(to) || from === to) bad('Payer and receiver must be two different group members');
  const amount = parseAmount(req.body.amount);
  if (amount <= 0) bad('Amount must be more than zero');
  const date = String(req.body.date || now()).slice(0, 10);
  recordPayment(g.id, req.user, from, to, amount, date, String(req.body.note || '').trim().slice(0, 80) || null);
  return { ok: true };
}));

app.delete('/api/groups/:id/payments/:pid', auth, wrap((req) => {
  const g = memberOf(req);
  const p = q('SELECT * FROM payments WHERE id = ? AND group_id = ? AND deleted_at IS NULL').get(req.params.pid, g.id);
  if (!p) throw new HttpError(404, 'Payment not found');
  q('UPDATE payments SET deleted_at = ? WHERE id = ?').run(now(), p.id);
  log(g.id, req.user.id, `${req.user.name} deleted a payment: ${nameOf(p.from_user)} → ${nameOf(p.to_user)} ${fmt(p.amount)}`);
  return { ok: true };
}));

// ---------- friends (totals across all groups) ----------
function friendSummary(me, other) {
  const groups = sharedGroups(me, other).map((g) => ({ ...g, amount: pairIn(g.id, me, other) }));
  return { total: groups.reduce((a, g) => a + g.amount, 0), groups };
}

app.get('/api/friends', auth, wrap((req) => {
  const others = q(`SELECT DISTINCT u.* FROM members m1 JOIN members m2 ON m2.group_id = m1.group_id
    JOIN users u ON u.id = m2.user_id WHERE m1.user_id = ? AND m2.user_id != ?`).all(req.user.id, req.user.id);
  return others.map((u) => ({ ...userPublic(u), ...friendSummary(req.user.id, u.id) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.name.localeCompare(b.name));
}));

app.get('/api/friends/:uid', auth, wrap((req) => {
  const u = q('SELECT * FROM users WHERE id = ?').get(req.params.uid);
  if (!u || !sharedGroups(req.user.id, u.id).length) throw new HttpError(404, 'Friend not found');
  return { ...userPublic(u), ...friendSummary(req.user.id, u.id) };
}));

// Settle everything with one friend: one payment per group, so every group's ledger stays exact.
app.post('/api/friends/:uid/settle', auth, wrap((req) => {
  const other = Number(req.params.uid);
  const { groups, total } = friendSummary(req.user.id, other);
  if (!groups.length) throw new HttpError(404, 'Friend not found');
  if (!groups.some((g) => g.amount)) bad('Nothing to settle — you are all square');
  const note = String(req.body.note || '').trim().slice(0, 60) || 'Settled all groups';
  tx(() => {
    for (const g of groups) {
      if (!g.amount) continue;
      const [from, to] = g.amount > 0 ? [other, req.user.id] : [req.user.id, other];
      recordPayment(g.id, req.user, from, to, Math.abs(g.amount), now().slice(0, 10), note);
    }
  });
  return { ok: true, total };
}));

// ---------- reminders ----------
function remind(req, other, groups) {
  const owing = groups.filter((g) => g.amount > 0);
  const total = owing.reduce((a, g) => a + g.amount, 0);
  if (!total) bad(`${nameOf(other)} doesn't owe you anything`);
  const recent = q('SELECT created_at FROM reminders WHERE from_user = ? AND to_user = ? ORDER BY id DESC LIMIT 1').get(req.user.id, other);
  if (recent && Date.now() - Date.parse(recent.created_at) < 6 * 3600 * 1000) bad('You can send one reminder to the same person every 6 hours');
  tx(() => {
    for (const g of owing) {
      q('INSERT INTO reminders (group_id, from_user, to_user, amount, created_at) VALUES (?,?,?,?,?)').run(g.id, req.user.id, other, g.amount, now());
      log(g.id, req.user.id, `${req.user.name} sent ${nameOf(other)} a reminder for ${fmt(g.amount)}`);
    }
  });
  const target = q('SELECT name, phone FROM users WHERE id = ?').get(other);
  const origin = `${req.protocol}://${req.get('host')}`;
  const lines = owing.length > 1 ? '\n' + owing.map((g) => `• ${g.name}: ${fmt(g.amount)}`).join('\n') : ` for "${owing[0].name}"`;
  const message = `Hi ${target.name}! Friendly reminder from Dostab — you owe me ${fmt(total)}${lines}\nDetails: ${origin}\n— ${req.user.name}`;
  const phone = (target.phone || '').replace(/^\+/, '').replace(/^0/, '92');
  return { total, message, whatsapp_url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` };
}
app.post('/api/groups/:id/remind', auth, wrap((req) => {
  const g = memberOf(req), other = Number(req.body.to_user);
  return remind(req, other, [{ id: g.id, name: g.name, amount: pairIn(g.id, req.user.id, other) }]);
}));
app.post('/api/friends/:uid/remind', auth, wrap((req) => {
  const other = Number(req.params.uid);
  return remind(req, other, friendSummary(req.user.id, other).groups);
}));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/join/:code', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  if (!(err instanceof HttpError)) console.error(err);
  res.status(err.status || 500).json({ error: err instanceof HttpError ? err.message : 'Something went wrong — please try again' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Dostab on :${port}`));
}
module.exports = { app, equalShares, pairDebts, parseAmount };
