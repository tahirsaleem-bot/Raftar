// Drum-odometer reader that keeps learning on the server, with nobody in the loop.
//
// 1. A reading the reader was sure of (or settled by the sheet history) is saved as a
//    labelled crop at once.
// 2. A photo it refused is kept (its odometer crop + the digits it did see). Every hour
//    the sheet is checked: once that day's FPU/LDO is in (filled by Raftar, by an email
//    reply, by hand), the crop is labelled with it — but only when the digits the reader
//    saw agree with the sheet value, so a photo never learns a number it does not show.
// Labels go to credentials/drum_labels (the volume) and are picked up without a deploy.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../logger');
const { resetTemplates, LEARNT_DIR } = require('./readDrum');

const PENDING_DIR = path.join(__dirname, '..', '..', 'credentials', 'drum_pending');
const PENDING_FILE = path.join(PENDING_DIR, 'pending.json');
const KEEP_DAYS = 7;
const MAX_LEARNT = 300;

const ensure = d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
const hashOf = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12);
const pad5 = v => String(Math.round(v)).padStart(5, '0');
function loadPending() { try { return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')); } catch { return []; } }
function savePending(list) { ensure(PENDING_DIR); fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 1)); }
function pktDate(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
function trimLearnt() {
  const fl = fs.readdirSync(LEARNT_DIR).filter(f => f.endsWith('.png')).sort();
  for (const f of fl.slice(0, Math.max(0, fl.length - MAX_LEARNT))) fs.unlinkSync(path.join(LEARNT_DIR, f));
}

// a reading we trust -> label now
async function learnConfident(hubName, imageBuffer, win, value) {
  if (!win || !(value > 0)) return;
  const text = pad5(value); if (text.length !== 5) return;
  ensure(LEARNT_DIR);
  const h = hashOf(imageBuffer);
  if (fs.readdirSync(LEARNT_DIR).some(f => f.includes(h))) return;
  await win.writeAsync(path.join(LEARNT_DIR, `${text}_n_${Date.now()}_${h}.png`));
  trimLearnt(); resetTemplates();
  logger.info(`[drum-learn] ${hubName}: learnt ${text} from a photo it read`);
}

// a refused photo -> keep it until the sheet has that day's number
async function rememberRefused(hubName, imageBuffer, r, tsMs = Date.now()) {
  if (!r || !r.win) return;
  const partial = String(r.partial || '');
  if (!(r.candidates && r.candidates.length) && partial.length < 3) return; // could not see enough to verify later
  const h = hashOf(imageBuffer);
  const list = loadPending();
  if (list.some(p => p.hash === h)) return;
  ensure(PENDING_DIR);
  const file = `${tsMs}_${h}.png`;
  await r.win.writeAsync(path.join(PENDING_DIR, file));
  list.push({ file, hash: h, hub: hubName, date: pktDate(tsMs), partial, candidates: r.candidates || null });
  savePending(list);
  logger.info(`[drum-learn] ${hubName}: kept a refused photo (saw "${partial}") to learn once the sheet has ${pktDate(tsMs)}'s reading`);
}

async function learnFromSheet() {
  const list = loadPending(); if (!list.length) return;
  const L = require('../sheets/logisticsClient');
  const today = pktDate(Date.now()), keep = [];
  let learnt = 0;
  for (const p of list) {
    const old = (Date.parse(today) - Date.parse(p.date)) / 86400000 > KEEP_DAYS;
    const src = path.join(PENDING_DIR, p.file);
    if (old || !fs.existsSync(src)) { try { fs.unlinkSync(src); } catch {} continue; }
    let row = null;
    try { const C = L.forHub(p.hub); const f = await C.findHubRow(p.hub, p.date); row = f && { fpu: f.row[C.COL.fpu], ldo: f.row[C.COL.ldo] }; } catch { keep.push(p); continue; }
    const vals = row ? [row.fpu, row.ldo].map(v => parseFloat(String(v || '').replace(/,/g, ''))).filter(v => v > 0 && Number.isFinite(v)) : [];
    const fits = [...new Set(vals.map(pad5).filter(s => s.length === 5 && (p.candidates ? p.candidates.includes(parseInt(s, 10)) : s.startsWith(p.partial))))];
    if (fits.length === 1) {
      ensure(LEARNT_DIR);
      fs.renameSync(src, path.join(LEARNT_DIR, `${fits[0]}_n_${p.file}`));
      learnt++;
      logger.info(`[drum-learn] ${p.hub}: learnt ${fits[0]} for ${p.date} (photo saw "${p.partial}", sheet has it)`);
    } else keep.push(p); // not in the sheet yet, or nothing fits — wait
  }
  savePending(keep);
  if (learnt) { trimLearnt(); resetTemplates(); }
}

function startDrumLearning() {
  const run = () => learnFromSheet().catch(e => logger.warn(`[drum-learn] ${e.message}`));
  setTimeout(run, 3 * 60 * 1000);
  setInterval(run, 60 * 60 * 1000);
  logger.info('[drum-learn] learning from refused Gulraiz photos once the sheet has the reading — checked hourly');
}

module.exports = { learnConfident, rememberRefused, learnFromSheet, startDrumLearning, PENDING_DIR };
