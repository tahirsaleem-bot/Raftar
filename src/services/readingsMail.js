// ─── Missing-readings email + fix-by-reply ───────────────────────────────────
// Asked for by Raftar on 2026-10-29 ("daily main nahi bata sakta — ye kaam aap
// ne khud karna hai"): every working day at 11:00 (FPU) and 18:30 (LDO) PKT,
// if any hub's reading is still blank, Raftar gets ONE email listing them. He
// can reply in that thread with lines like
//     I-10 Tarnol FPU 0
//     Ghauri LDO 45.2
//     Gulraiz off
// and every 5 minutes the replies are read, written to the sheet (same
// validation as a photo) and confirmed in the same thread.
//
// Mail goes from and to the token's own mailbox (tahir.saleem@niete.edu.pk).
// Only replies From that address are acted on. The token on Railway has
// gmail.readonly + gmail.send (no modify), so handled messages are remembered
// in credentials/readings_mail.json rather than marked read.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cron = require('node-cron');
const { google } = require('googleapis');
const logger = require('../logger');

const OWNER = (process.env.READINGS_MAIL_TO || 'tahir.saleem@niete.edu.pk').toLowerCase();
const STATE_FILE = path.join(__dirname, '..', '..', 'credentials', 'readings_mail.json');
const TZ = process.env.TIMEZONE || 'Asia/Karachi';

function gmail() {
  const dir = path.join(__dirname, '..', '..', 'credentials');
  const creds = JSON.parse(fs.readFileSync(path.join(dir, 'google-oauth-client.json')));
  const token = JSON.parse(fs.readFileSync(path.join(dir, 'google-token.json')));
  const { client_id, client_secret } = creds.installed || creds.web;
  const o = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  o.setCredentials(token);
  return google.gmail({ version: 'v1', auth: o });
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { threads: {}, done: [] }; }
}
function saveState(s) {
  // keep a week of threads and the last 500 handled message ids
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  for (const [id, t] of Object.entries(s.threads)) if (t.dateKey < cutoff) delete s.threads[id];
  s.done = s.done.slice(-500);
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 1));
}

const dayText = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// ─── Which hubs are still blank ──────────────────────────────────────────────
async function missingFor(dateKey, kind) {
  const { ALL_HUBS, fleetForHub } = require('../config/hubGroups');
  const { forHub } = require('../sheets/logisticsClient');
  // A hub with nothing at all today did not run (the 21:00 off-marker marks it
  // off), so it is not "blank". Raftar, 2026-11-02: only a half-done day is
  // worth an email: a photo came but no FPU, or FPU without LDO (or the reverse).
  const { getLatestHubImage } = require('../whatsapp/whatsappClient');
  const dayOf = ts => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
  const out = [];
  for (const hub of ALL_HUBS()) {
    const lc = forHub(hub.hubName);
    const found = await lc.findHubRow(hub.hubName, dateKey);
    const fpu = found ? String(found.row[lc.COL.fpu] ?? '').trim() : '', ldo = found ? String(found.row[lc.COL.ldo] ?? '').trim() : '';
    if (fpu.toLowerCase() === 'off' || ldo.toLowerCase() === 'off') continue;
    const base = { hub: hub.hubName, fleet: fleetForHub(hub.hubName) };
    if (kind === 'FPU' && fpu === '' && ldo === '') {
      const img = getLatestHubImage(hub.hubName);
      if (img && dayOf(img.ts) === dateKey) out.push({ ...base, why: 'photo aayi lekin reading nahi parhi gayi' });
    }
    if (kind === 'LDO' && fpu !== '' && ldo === '') out.push({ ...base, fpu });
    if (kind === 'LDO' && fpu === '' && ldo !== '') out.push({ ...base, kind: 'FPU', why: `LDO ${ldo} hai lekin FPU khaali` });
  }
  return out;
}

// ─── Sending ─────────────────────────────────────────────────────────────────
function rawMail({ subject, text, inReplyTo }) {
  const lines = [
    `To: ${OWNER}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ];
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`);
  return Buffer.from([...lines, '', Buffer.from(text).toString('base64')].join('\r\n')).toString('base64url');
}

async function sendMissingMail(kind) {
  const { todayISO, isWorkday } = require('../sheets/logisticsClient');
  const dateKey = todayISO(TZ);
  if (!isWorkday(dateKey)) return;
  let missing;
  try { missing = await missingFor(dateKey, kind); } catch (err) {
    logger.error(`[mail] could not check ${kind} readings: ${err.message}`);
    return;
  }
  if (!missing.length) { logger.info(`[mail] ${dateKey} ${kind}: every hub has a reading — no email`); return; }
  const label = kind === 'FPU' ? 'subah ki FPU (11 baje tak)' : 'shaam ki LDO / drop (6:30 tak)';
  const list = missing.map(m => `• ${m.hub} (${m.fleet === 'rawalpindi' ? 'Rawalpindi' : 'Islamabad'})${m.why ? ' — ' + m.why : ''}`).join('\n');
  const eg = missing.slice(0, 2).map(m => `${m.hub} ${m.kind || kind} ${(m.kind || kind) === 'FPU' ? '0' : '45.2'}`).join('\n');
  const subject = `Raftar: ${missing.length} reading khaali — ${dayText(dateKey)} (${kind})`;
  const text = `Assalam o Alaikum Raftar,

${dayText(dateKey)} — in hubs ki ${label} sheet mein nahi aayi:
${list}

Theek karne ke liye isi email ka reply karein, har line par ek hub, misaal:
${eg}
(us din gaari nahi chali to hub ke naam ke saath "off" likhein)

Main reply parh kar sheet mein likh dunga aur isi email mein confirm kar dunga.

Sent by Raftar`;
  try {
    const r = await gmail().users.messages.send({ userId: 'me', requestBody: { raw: rawMail({ subject, text }) } });
    const st = loadState();
    st.threads[r.data.threadId] = { dateKey, kind, subject, sentIds: [r.data.id] };
    saveState(st);
    logger.info(`[mail] ${kind} email sent — ${missing.length} hub(s) blank: ${missing.map(m => m.hub).join(', ')}`);
  } catch (err) {
    logger.error(`[mail] could not send ${kind} email: ${err.message}`);
  }
}

// ─── Reading a reply ─────────────────────────────────────────────────────────
const HUB_KEYS = [
  ['G-13', /\bg[\s-]?13\b/i], ['Scheme 3', /\bscheme(?:\s*-?\s*3)?\b/i], ['Khawaja corporation', /\bkhawaja(?:\s+corporation)?\b/i],
  ['Tramri Chowk', /\btramri(?:\s+chowk)?\b/i], ['H-13 Tarnol', /\bh[\s-]?13(?:\s+tarnol)?\b/i], ['I-10 Tarnol', /\bi[\s-]?10(?:\s+tarnol)?\b/i],
  ['Misrial Road', /\bmisrial(?:\s+road)?\b/i], ['Gulraiz car chowk', /\bgulraiz(?:\s+car)?(?:\s+chowk)?\b/i],
  ['Bahria Ph-5', /\bbahria(?:\s+ph(?:ase)?[\s-]?5)?\b/i], ['Ghauri town', /\bghauri(?:\s+town)?\b/i], ['DHA', /\bdha\b/i],
];

// one instruction per line; quoted history ("On … wrote:", "> …") is ignored
function parseReply(text, defaultKind) {
  const body = String(text || '').split(/\r?\n/);
  const cut = body.findIndex(l => /^On .+wrote:\s*$/i.test(l.trim()) || /^-{2,}\s*Original Message/i.test(l.trim()) || /^>/.test(l));
  const lines = (cut >= 0 ? body.slice(0, cut) : body).map(l => l.trim()).filter(Boolean);
  const cmds = [];
  for (const line of lines) {
    const hit = HUB_KEYS.find(([, re]) => re.test(line));
    if (!hit) continue;
    const rest = line.replace(hit[1], ' ');
    const kind = /\boff\b|chhutti|chutti/i.test(rest) ? 'off'
      : /\b(fpu|start|subah|morning)\b/i.test(rest) ? 'FPU'
      : /\b(ldo|end|drop|shaam|evening)\b/i.test(rest) ? 'LDO' : defaultKind;
    const m = rest.match(/(?<![\d.])(\d{1,6}(?:[.,]\d{1,2})?)(?![\d.])/);
    if (kind !== 'off' && !m) { cmds.push({ hub: hit[0], kind, error: 'number nahi mila', line }); continue; }
    cmds.push({ hub: hit[0], kind, km: m ? parseFloat(m[1].replace(',', '.')) : null, force: /\bforce\b/i.test(rest), line });
  }
  return cmds;
}

async function applyCommand(c, dateKey) {
  if (c.error) return `✗ ${c.hub}: ${c.error} ("${c.line}")`;
  const { forHub } = require('../sheets/logisticsClient');
  const { validateHubKM, validateTripDay } = require('../validation/validateKM');
  const lc = forHub(c.hub);
  if (c.kind === 'off') {
    const r = await lc.markOff(c.hub, dateKey);
    return r.success ? `✓ ${c.hub}: off likh diya` : `✗ ${c.hub}: off nahi likha — ${r.reason}`;
  }
  const fpu = await lc.getFPU(c.hub, dateKey).catch(() => null);
  if (!c.force) {
    let last = null;
    try { last = await lc.getLastReading(c.hub, dateKey); } catch { /* checked on bounds only */ }
    const v = validateHubKM(c.hub, c.km, { lastReading: last, fpu: c.kind === 'LDO' ? fpu : null });
    if (!v.valid) return `✗ ${c.hub}: ${c.km} nahi likha — ${v.reason}. Sahi ho to line ke aakhir mein "force" likh kar dobara bhejein.`;
    if (c.kind === 'LDO') {
      const d = validateTripDay(c.hub, c.km, fpu);
      if (!d.valid) return `✗ ${c.hub}: ${c.km} nahi likha — ${d.reason}. Sahi ho to "force" likh kar dobara bhejein.`;
    }
  }
  const r = c.kind === 'FPU' ? await lc.updateFPU(c.hub, dateKey, c.km) : await lc.updateLDOAndTotal(c.hub, dateKey, c.km);
  if (!r || r.success !== true) return `✗ ${c.hub}: sheet mein nahi likha ja saka — ${r?.reason || 'row nahi mili'}`;
  return `✓ ${c.hub}: ${c.kind} = ${c.km} likh diya${c.kind === 'LDO' && r.total != null ? ` (aaj ${r.total} km)` : ''}`;
}

const header = (msg, name) => (msg.payload.headers || []).find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
function plainText(part) {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return Buffer.from(part.body.data, 'base64url').toString('utf8');
  for (const p of part.parts || []) { const t = plainText(p); if (t) return t; }
  return '';
}

let polling = false;
async function pollReplies() {
  if (polling) return;
  polling = true;
  try {
    const st = loadState();
    const g = gmail();
    for (const [threadId, t] of Object.entries(st.threads)) {
      const th = await g.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
      for (const msg of th.data.messages || []) {
        if (t.sentIds.includes(msg.id) || st.done.includes(msg.id)) continue;
        st.done.push(msg.id);
        const from = header(msg, 'From').toLowerCase();
        if (!from.includes(OWNER)) { logger.warn(`[mail] reply in ${t.kind} thread from ${from} ignored (not the owner)`); continue; }
        const cmds = parseReply(plainText(msg.payload), t.kind);
        logger.info(`[mail] reply for ${t.dateKey} ${t.kind}: ${cmds.length} instruction(s)`);
        const results = [];
        for (const c of cmds) results.push(await applyCommand(c, t.dateKey).catch(e => `✗ ${c.hub}: ${e.message}`));
        const text = `${results.length ? results.join('\n') : 'Is reply mein koi hub aur reading samajh nahi aayi. Har line par aise likhein: "Ghauri LDO 45.2" ya "I-10 off".'}

Sent by Raftar`;
        const r = await g.users.messages.send({ userId: 'me', requestBody: { threadId, raw: rawMail({ subject: `Re: ${t.subject}`, text, inReplyTo: header(msg, 'Message-ID') }) } });
        t.sentIds.push(r.data.id);
        logger.info(`[mail] confirmed in thread: ${results.join(' | ')}`);
      }
    }
    saveState(st);
  } catch (err) {
    logger.error(`[mail] reply check failed: ${err.message}`);
  } finally {
    polling = false;
  }
}

function startReadingsMail() {
  if (process.env.READINGS_MAIL === 'off') { logger.info('[mail] missing-readings email is off'); return; }
  cron.schedule('0 11 * * 1-5', () => sendMissingMail('FPU'), { timezone: TZ });
  cron.schedule('30 18 * * 1-5', () => sendMissingMail('LDO'), { timezone: TZ });
  cron.schedule('*/5 7-23 * * *', () => pollReplies(), { timezone: TZ });
  logger.info(`[mail] missing-readings email to ${OWNER} at 11:00 (FPU) + 18:30 (LDO), replies checked every 5 min`);
}

module.exports = { startReadingsMail, sendMissingMail, pollReplies, parseReply, missingFor };
