const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { extractKMFromImage } = require('../vision/extractKM');
const { validateKM } = require('../validation/validateKM');
const { writeKMRecord, recordExists, updateKMRecord } = require('../sheets/sheetsClient');
const config = require('../config');
const logger = require('../logger');

let client = null;
let clientReady = false;
let currentQRCode = null;
let readyPoll = null;

// ─── In-memory recent-messages buffer (fed by live 'message' events) ──────────
// getChats()/fetchMessages() throw a minified internal error ("r") on the
// pinned web version, so message history can't be pulled from the store.
// Instead we buffer every live message here and serve the dashboard from this.
// Only holds messages that arrive while the server is running.
const recentMessages = new Map(); // chatId -> [ {from, senderName, type, timestamp, body, hasMedia}, ... ]
const MAX_PER_CHAT = 50;

function bufferMessage(msg) {
  try {
    if (!msg || !msg.from) return;
    const chatId = msg.from;
    if (String(chatId).includes('status@broadcast')) return;
    const arr = recentMessages.get(chatId) || [];
    arr.push({
      from: msg.from,
      senderName: msg._data?.notifyName || msg.from,
      type: msg.type,
      timestamp: new Date(msg.timestamp * 1000).toISOString(),
      body: msg.body ? msg.body.substring(0, 100) : '',
      hasMedia: msg.hasMedia || false,
    });
    while (arr.length > MAX_PER_CHAT) arr.shift();
    recentMessages.set(chatId, arr);
  } catch {
    // never let buffering break message handling
  }
}

function getRecentMessages() {
  return recentMessages;
}

// ─── Live per-hub image buffer ────────────────────────────────────────────────
// The schedulers used to reach into `window.Store.Chat` to pull the latest image
// from a group. On the pinned web version that object does not exist, so every
// scheduled run failed with "Cannot read properties of undefined (reading
// 'Chat')" and reported "No image found" for all 7 hubs even when the drivers
// had sent photos (seen live 2026-09-08 10:00 UTC).
//
// The live 'message' handler, by contrast, decrypts media successfully. So we
// keep each hub's recent images here and let the schedulers read from this
// instead of the broken store. Caveat: this only holds images that arrived while
// the process was running — fine for a 24/7 service, but a restart empties it.
const hubImages = new Map(); // hubName -> [{ buffer, mimetype, senderName, ts, msg }] newest last
const MAX_IMAGES_PER_HUB = 10;

function bufferHubImage(hubName, buffer, mimetype, senderName, ts, msg) {
  try {
    if (!hubName || !buffer) return;
    const arr = hubImages.get(hubName) || [];
    arr.push({ buffer, mimetype: mimetype || 'image/jpeg', senderName, ts, msg }); // msg: so a later check can reply to this photo
    // Drop anything older than 24h so yesterday's photo can never be reused,
    // then cap the list to keep memory flat.
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const kept = arr.filter(e => e.ts >= cutoff);
    while (kept.length > MAX_IMAGES_PER_HUB) kept.shift();
    hubImages.set(hubName, kept);
    logger.info(`[whatsapp] Buffered image for ${hubName} (${kept.length} held)`);
  } catch (err) {
    logger.warn(`[whatsapp] Could not buffer hub image: ${err.message}`);
  }
}

// Newest buffered image for a hub within an optional time window (ms epoch).
function getLatestHubImage(hubName, opts = {}) {
  const { sinceMs = 0, untilMs = Infinity } = opts;
  const arr = hubImages.get(hubName) || [];
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].ts >= sinceMs && arr[i].ts <= untilMs) return arr[i];
  }
  return null;
}

const SESSION_DIR = './credentials/whatsapp-session-active';

// ─── Stale Chromium profile locks ─────────────────────────────────────────────
// The session lives on a persistent volume, but the container it was written by
// does not. Chromium stamps SingletonLock with "<hostname>-<pid>", and every new
// Railway container gets a fresh hostname — so on the next boot Chromium reads a
// lock that looks like it belongs to "another computer", refuses to open the
// profile, and Puppeteer dies with "Failed to launch the browser process: Code: 21".
// That is what crashed this service on 2026-08-04. It never self-heals, because
// the lock is restored from the volume on every restart, so we clear it here.
function clearStaleLocks(reason) {
  const names = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  let removed = 0;
  const walk = dir => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (names.includes(e.name)) {
        // lstat/unlink, not exists/rm — SingletonLock is a dangling symlink, so
        // fs.existsSync() follows it and reports false while the file is really there.
        try { fs.lstatSync(p); fs.unlinkSync(p); removed++; logger.info(`[whatsapp] removed stale ${e.name} (${reason})`); }
        catch (err) { logger.error(`[whatsapp] could not remove ${p}: ${err.message}`); }
      } else if (e.isDirectory()) {
        walk(p);
      }
    }
  };
  walk(SESSION_DIR);
  if (!removed) logger.info(`[whatsapp] no stale Chromium locks found (${reason})`);
  return removed;
}

// Wipe the whole session so a fresh QR is issued. Set WHATSAPP_RESET_SESSION=1
// when the linked-device session has expired (WhatsApp drops them after ~14 days
// offline). Log in, then REMOVE the flag — otherwise every deploy needs a new scan.
function resetSessionIfRequested() {
  const flag = String(process.env.WHATSAPP_RESET_SESSION || '').trim().toLowerCase();
  if (!['1', 'true', 'yes'].includes(flag)) return false;
  try {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    logger.info('[whatsapp] WHATSAPP_RESET_SESSION set — session wiped, a new QR will be issued');
    logger.info('[whatsapp] REMEMBER: unset WHATSAPP_RESET_SESSION after scanning, or you will re-scan every deploy');
    return true;
  } catch (err) {
    logger.error(`[whatsapp] session reset failed: ${err.message}`);
    return false;
  }
}

// ─── Initialize WhatsApp Client ───────────────────────────────────────────────
function initWhatsApp() {
  resetSessionIfRequested();
  clearStaleLocks('startup');

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './credentials/whatsapp-session-active' }),
    // NO web-version pin. The old June pin (2.3000.1041096482) broke the whole
    // injected Store on wweb.js 1.34.x — getChats/fetchMessages/getChat/
    // downloadMedia all threw a minified "r" error. We now run wweb.js 1.34.7
    // against the LIVE current WhatsApp Web build so the Store works. If `ready`
    // is flaky, the getState() poller below still brings us online.
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      // On Railway (Linux) PUPPETEER_EXECUTABLE_PATH points to the container's
      // Chromium (set in the Dockerfile). Locally on Windows it falls back to
      // installed Chrome. WHATSAPP_CHROME_PATH is an optional manual override.
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        process.env.WHATSAPP_CHROME_PATH ||
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    },
  });

  // QR Code — scan once with your phone
  client.on('qr', async qr => {
    currentQRCode = qr;
    console.log('\n========================================');
    console.log('  Scan this QR code with WhatsApp');
    console.log('  Phone → WhatsApp → Linked Devices → Link a Device');
    console.log('========================================\n');
    qrcode.generate(qr, { small: true });

    // Save QR code as PNG image
    try {
      const qrImagePath = path.join(__dirname, '../../status/qrcode.png');
      await QRCode.toFile(qrImagePath, qr, { width: 300, margin: 1 });
      logger.info(`[whatsapp] QR code saved to: ${qrImagePath}`);
      console.log(`\n✅ QR Code saved to: ${qrImagePath}`);
    } catch (err) {
      logger.error('[whatsapp] Failed to save QR code image:', err.message);
    }
  });

  // Idempotent "we are live" marker — can be triggered by the ready event OR by
  // the getState() poller below, whichever happens first.
  function markReady(source) {
    if (clientReady) return;
    clientReady = true;
    if (readyPoll) { clearInterval(readyPoll); readyPoll = null; }
    logger.info(`[whatsapp] Client ready (via ${source}) — listening for messages`);
    console.log('\n✔ WhatsApp connected and ready!\n');
  }

  client.on('loading_screen', (percent, message) => {
    logger.info(`[whatsapp] Loading ${percent}% — ${message}`);
  });

  client.on('authenticated', () => {
    logger.info('[whatsapp] Authenticated — session saved');
    // Fallback: on the pinned web build, the 'ready' event is flaky and can
    // never fire even though the client IS connected. Poll getState() and go
    // live as soon as WhatsApp reports CONNECTED.
    if (readyPoll) clearInterval(readyPoll);
    let tries = 0;
    readyPoll = setInterval(async () => {
      tries++;
      if (clientReady) { clearInterval(readyPoll); readyPoll = null; return; }
      try {
        const state = await client.getState(); // 'CONNECTED' when live
        if (state === 'CONNECTED') {
          markReady('getState poll');
        } else {
          logger.info(`[whatsapp] Waiting for CONNECTED… (state=${state}, try ${tries})`);
        }
      } catch (err) {
        logger.info(`[whatsapp] getState not ready yet (try ${tries})`);
      }
      if (tries >= 40) { // ~2 min safety cap
        clearInterval(readyPoll); readyPoll = null;
        logger.warn('[whatsapp] getState poll gave up after 40 tries — still not CONNECTED');
      }
    }, 3000);
  });

  client.on('ready', () => {
    markReady('ready event');
  });

  client.on('disconnected', reason => {
    clientReady = false;
    logger.warn('[whatsapp] Disconnected:', reason, '— reconnecting in 30s');
    setTimeout(() => {
      logger.info('[whatsapp] Attempting reconnect...');
      try {
        if (client) { try { client.destroy(); } catch {} }
        initWhatsApp();
      } catch (err) {
        logger.error('[whatsapp] Reconnect failed:', err.message);
      }
    }, 30000);
  });

  // ── Handle incoming messages (from OTHERS) ──────────────────────────────────
  client.on('message', async msg => {
    try {
      if (!msg || !msg.type) return;
      bufferMessage(msg);
      await handleMessage(msg);
    } catch (err) {
      logger.error('[whatsapp] Error handling message:', err.message);
    }
  });

  // ── Handle messages YOU send from the linked account ────────────────────────
  // 'message' does NOT fire for your own outgoing messages — 'message_create'
  // does. Needed so a test photo sent from the linked phone is also processed.
  client.on('message_create', async msg => {
    try {
      if (!msg || !msg.type || !msg.fromMe) return; // incoming handled by 'message'
      bufferMessage(msg);
      await handleMessage(msg);
    } catch (err) {
      logger.error('[whatsapp] Error handling own message:', err.message);
    }
  });

  // client.initialize() rejects asynchronously. Unhandled, that rejection kills
  // the process and Railway restarts it into the same locked profile — the exact
  // crashloop seen on 2026-08-04. Catch it, clear the locks, and retry ONCE.
  let launchRetried = false;
  const launch = () => {
    client.initialize().catch(err => {
      const msg = err && err.message ? err.message : String(err);
      const isProfileLock = /Failed to launch the browser process|profile appears to be in use|Code: 21/i.test(msg);

      if (isProfileLock && !launchRetried) {
        launchRetried = true;
        logger.error(`[whatsapp] browser launch failed on a locked profile: ${msg.split('\n')[0]}`);
        clearStaleLocks('launch-failure retry');
        logger.info('[whatsapp] retrying browser launch once...');
        setTimeout(launch, 2000);
        return;
      }

      // Don't take the whole agent down — Sheets, the schedulers and the dashboard
      // all work without WhatsApp. Log loudly and stay up so /api/qr-status is reachable.
      logger.error(`[whatsapp] initialize failed, continuing without WhatsApp: ${msg.split('\n')[0]}`);
      if (isProfileLock) {
        logger.error('[whatsapp] profile is still locked after a retry. If this persists, redeploy with WHATSAPP_RESET_SESSION=1 to wipe the session and re-scan the QR.');
      }
    });
  };
  launch();

  return client;
}

// ─── Hard allowlist — only these phone numbers can submit KM ─────────────────
// Add team member numbers here (without + or spaces, with country code: 92 = Pakistan)
// Format: '92XXXXXXXXXX' (country code + 10-digit number)
// Security: Only listed numbers can submit. Empty = allows all (INSECURE — populate ASAP)
const ALLOWED_NUMBERS = [
  // '923001234567',  // Ali Hassan
  // '923009876543',  // Sara Ahmed
  // Add your team members above — copy phone numbers from src/validation/validateKM.js TEAM_MEMBERS
];

// ─── Validate a hub reading and write it to the Logistics sheet ──────────────
// Shared by the photo path and by a driver's typed reply (see askDriverForReading).
// Returns true only when a cell was actually written.
async function writeHubReading({ hubName, km, confidence, dateKey, localHour, senderName, submittedAt }) {
  if (!require('../sheets/logisticsClient').isWorkday(dateKey)) {
    logger.info(`[whatsapp] ${dateKey} is a weekend — ${hubName} reading ${km} not written (Mon-Fri only)`);
    return;
  }
  try {
    // The hub's own fleet tab (Islamabad or Rawalpindi) and column layout
    const { updateFPU, updateLDOAndTotal, getLastReading, getFPU } = require('../sheets/logisticsClient').forHub(hubName);
    const { validateHubKM, validateTripDay } = require('../validation/validateKM');
    // Before 12 noon PKT = FPU, after = LDO. This used getHours(), which is
    // UTC on Railway — so every photo before 17:00 PKT was treated as a
    // morning FPU and an afternoon LDO would have overwritten the FPU cell.
    // FPU vs LDO is decided by today's FPU cell, not by the clock alone.
    // A fixed 12:00 cut-off misfiled real photos on 2026-10-20: Khawaja's
    // evening-style 52.4 arrived at 11:53 (taken as FPU), and Misrial's
    // morning 0.0 arrived at 12:44 (would have been an LDO of 0).
    //   FPU blank  -> FPU if before noon or the meter shows 0, else LDO
    //   FPU filled -> same value again = duplicate (skip); higher = LDO;
    //                 lower = misread or wrong car (reject)
    const hour = localHour;
    const kmNow = parseFloat(km);
    // Today's rows are created by the 10 AM FPU run. A photo that arrives
    // earlier (most do: 08:00-09:30) found no row and its write failed, so
    // create the day's rows on demand. addDailyRows is a no-op if they exist.
    const { findHubRow, addDailyRows } = require('../sheets/logisticsClient').forHub(hubName);
    if (!(await findHubRow(hubName, dateKey))) await addDailyRows(dateKey);
    let fpu = null;
    try { fpu = await getFPU(hubName, dateKey); } catch (err) {
      logger.warn(`[whatsapp] Could not read today's ${hubName} FPU (non-fatal): ${err.message}`);
    }
    let type;
    if (fpu == null) type = (hour < 12 || kmNow === 0) ? 'FPU' : 'LDO';
    else if (kmNow === fpu) {
      logger.info(`[whatsapp] ${hubName}: ${kmNow} equals today's FPU — duplicate photo, nothing to write`);
      return;
    } else if (kmNow > fpu) type = 'LDO';
    else {
      logger.warn(`[whatsapp] REJECTED ${hubName}: reading ${kmNow} is below today's FPU ${fpu} — sheet not touched`);
      return;
    }

    // ── Validate BEFORE writing ────────────────────────────────────────────
    // This block used to `return` before validateKM() ever ran, so hub writes
    // were completely unvalidated: on 2026-09-08 OCR noise (I-10 Tarnol 1111,
    // Khawaja corporation 809) went straight to updateFPU. Bounds are per
    // meter type because a flat KM_MAX cannot serve both trip and odometer
    // hubs — see validateHubKM().
    let lastReading = null;
    try {
      lastReading = await getLastReading(hubName, dateKey);
    } catch (err) {
      logger.warn(`[whatsapp] Could not read last ${hubName} reading (non-fatal): ${err.message}`);
    }

    const hubCheck = validateHubKM(hubName, km, { lastReading, fpu });
    if (!hubCheck.valid) {
      logger.warn(`[whatsapp] REJECTED ${type} for ${hubName}: ${hubCheck.reason} (confidence=${confidence ?? 'n/a'}) — sheet not touched`);
      return;
    }
    if (type === 'LDO') { // trip and odometer alike: Total = LDO - FPU
      const dayCheck = validateTripDay(hubName, hubCheck.km, fpu);
      if (!dayCheck.valid) {
        logger.warn(`[whatsapp] REJECTED LDO for ${hubName}: ${dayCheck.reason} — sheet not touched`);
        return;
      }
    }

    // ── Write, and report what actually happened ──────────────────────────
    // updateFPU/updateLDOAndTotal return {success}. That return value used to
    // be ignored, so a failed write still logged "Updated FPU for …" directly
    // under the warning saying no row was found. Never log success blind.
    // trip reading on an odometer hub with no FPU yet: FPU 0 like the trip hubs
    if (type === 'LDO' && fpu == null && hubCheck.meter === 'trip') await updateFPU(hubName, dateKey, 0);
    const result = type === 'FPU'
      ? await updateFPU(hubName, dateKey, hubCheck.km)
      : await updateLDOAndTotal(hubName, dateKey, hubCheck.km);

    if (!result || result.success !== true) {
      logger.error(`[whatsapp] ${type} write FAILED for ${hubName} on ${dateKey}: ${result?.reason || 'row not found'}`);
      return;
    }
    if (hubCheck.warning) logger.warn(`[whatsapp] ${hubName}: ${hubCheck.warning}`);
    logger.info(`[whatsapp] ${type} written for ${hubName}: ${hubCheck.km} (${hubCheck.meter} meter)`);

    // Store submission for dashboard (non-blocking)
    try {
      const axios = require('axios');
      axios.post('http://localhost:3000/api/store-submission', {
        driver: senderName,
        hub: hubName,
        km: hubCheck.km,
        type: type,
        timestamp: submittedAt,
        status: '✅ Updated'
      }).catch(() => {});
    } catch (err) {
      logger.warn('[whatsapp] Submission storage skipped');
    }

    return type;
  } catch (err) {
    logger.error(`[whatsapp] Failed to update sheet for ${hubName}:`, err.message);
    return false;
  }
}

// ─── Repeat-photo guard ───────────────────────────────────────────────────────
// SHA-1 of every hub photo -> the date it was first seen, kept on the volume
// so it survives restarts. A photo first seen on an EARLIER day is ignored.
// (Same-day repeats are harmless: writeHubReading skips a value equal to FPU.)
const PHOTO_HASH_FILE = './credentials/meter_photo_hashes.json';
const PHOTO_HASH_KEEP_DAYS = 45;
let photoHashes = null;
function isRepeatPhoto(hubName, buf, dateKey) {
  try {
    if (!photoHashes) {
      try { photoHashes = JSON.parse(fs.readFileSync(PHOTO_HASH_FILE, 'utf8')); } catch { photoHashes = {}; }
    }
    const h = require('crypto').createHash('sha1').update(buf).digest('hex');
    const first = photoHashes[h];
    if (first && first.date < dateKey) {
      logger.warn(`[whatsapp] ${hubName}: this exact photo was already sent on ${first.date} — old photo, ignored`);
      return true;
    }
    if (!first) {
      photoHashes[h] = { date: dateKey, hub: hubName };
      const cutoff = new Date(Date.now() - PHOTO_HASH_KEEP_DAYS * 86400000).toISOString().slice(0, 10);
      for (const [k, v] of Object.entries(photoHashes)) if (v.date < cutoff) delete photoHashes[k];
      fs.writeFileSync(PHOTO_HASH_FILE, JSON.stringify(photoHashes));
    }
  } catch (err) {
    logger.warn(`[whatsapp] repeat-photo check skipped: ${err.message}`);
  }
  return false;
}

// How many distinct photos a hub group sent on `dateKey` (any photo — meter
// or not). Read from the persisted hash file, so it survives restarts.
function hubPhotoCount(hubName, dateKey) {
  try {
    if (!photoHashes) {
      try { photoHashes = JSON.parse(fs.readFileSync(PHOTO_HASH_FILE, 'utf8')); } catch { photoHashes = {}; }
    }
    return Object.values(photoHashes).filter(v => v.hub === hubName && v.date === dateKey).length;
  } catch { return 0; }
}

// ─── Ask the driver to type a reading the LCD reader could not read ──────────
// Chosen by Tahir on 2026-10-20 so unreadable photos still reach the sheet
// with the laptop off. Off unless ASK_DRIVER_ON_FAIL=true (CLAUDE.md rule 1:
// the message text was previewed and approved before enabling). A typed reply
// is accepted only from that hub's group, only while a request is open, and
// only if it is a bare trip-meter number — then it goes through exactly the
// same validation as a photo (writeHubReading).
// hubName -> { askedAt, dateKey }. Kept on the volume: on 2026-10-26 a restart
// 2 min after asking Tramri's driver wiped the request and the typed reply was ignored.
const PENDING_ASKS_FILE = path.join(__dirname, '..', '..', 'credentials', 'pending_asks.json');
const pendingAsks = new Map((() => { try { return Object.entries(JSON.parse(fs.readFileSync(PENDING_ASKS_FILE, 'utf8'))); } catch { return []; } })());
function savePendingAsks() {
  try { fs.writeFileSync(PENDING_ASKS_FILE, JSON.stringify(Object.fromEntries(pendingAsks))); }
  catch (err) { logger.warn(`[whatsapp] Could not save pending asks: ${err.message}`); }
}
const ASK_WINDOW_MS = parseFloat(process.env.ASK_DRIVER_WINDOW_HOURS || '4') * 3600 * 1000;
// 4 h, not 1 h: on 2026-11-03 G-13's driver was asked at 07:37 and again by
// the 10 AM run for the same photo. A morning ask now covers the whole morning.
const ASK_COOLDOWN_MS = 4 * 60 * 60 * 1000;
// Gulraiz has a mechanical drum odometer the LCD reader cannot read, so its
// driver is never asked; the 11:00 email lists the hub and Raftar replies.
const NO_ASK_HUBS = new Set(['Gulraiz car chowk']);

// Wording set by Tahir on 2026-10-26: no hub name, the driver is @mentioned.
// `mention` is the "@<number>" token for the photo's sender ('' if unknown).
function askMessageFor(mention = '') {
  return `${mention ? mention + ' ' : ''}Assalam o Alaikum! Meter reading ki pic saaf parhi nahi ja rahi. ` +
    'Meherbani kar ke reading type kar ke de dein (jaise 98.5).\n\nSent by Raftar';
}

function localTimeParts(tsMs) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: config.app.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(tsMs)).map(x => [x.type, x.value]));
  return { dateKey: `${p.year}-${p.month}-${p.day}`, localHour: parseInt(p.hour, 10) };
}

// A reading the driver wrote in the photo caption, e.g. "Ride start 41874" or
// "62.2 km". Times (9:10am, 12:14pm) and dates (27-10-2026) are not readings.
// Returns a number only when exactly one plausible reading is in the text.
function readingFromText(text, meterType) {
  let s = ` ${String(text || '')} `;
  s = s.replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ')                 // dates
       .replace(/\b\d{1,2}[:.]\d{2}\s*(?:am|pm)\b/gi, ' ')                   // 9.10am, 12:14pm
       .replace(/\b\d{1,2}:\d{2}\b/g, ' ')                                   // 14:05
       .replace(/\b\d{1,2}\s*(?:am|pm)\b/gi, ' ');                           // 9am
  // Strict on purpose: a stray "car 2" must never become a 2 km day. A trip
  // reading needs its decimal (62.2, 0.0) or "km"; an odometer is 4-6 digits.
  const toks = [...s.matchAll(/(?<![\d.,])(\d{1,6})(?:[.,](\d))?(?![\d.,]*\d)\s*(km)?/gi)];
  const fits = [];
  for (const [, whole, dec, km] of toks) {
    const n = parseFloat(dec != null ? `${whole}.${dec}` : whole);
    const trip = (dec != null || km) && n < 10000;
    const odo = meterType === 'odometer' && dec == null && whole.length >= 4;
    if (trip || odo) fits.push(n);
  }
  return fits.length === 1 ? fits[0] : null;
}

// Replies to the unreadable photo itself and @mentions its sender, so the
// driver gets a direct notification and everyone sees which photo it was.
// If the reply/mention fails on this WhatsApp Web build, falls back to a plain
// group message so the request is never silently lost.
// Drivers often type the reading a moment after the photo; asking at once
// annoyed them (Raftar, 2026-10-27). So the hub is first opened for a typed
// reply and the question goes out only if nothing arrives within ASK_DELAY.
const ASK_DELAY_MS = parseFloat(process.env.ASK_DRIVER_DELAY_MIN || '3') * 60 * 1000;
function openForTyped(hubName, dateKey) {
  const cur = pendingAsks.get(hubName);
  if (!cur || cur.dateKey !== dateKey) pendingAsks.set(hubName, { openedAt: Date.now(), dateKey });
  else cur.openedAt = Date.now();
  savePendingAsks();
}
function askDriverLater(hubName, chatId, dateKey, why, photoMsg) {
  if (process.env.ASK_DRIVER_ON_FAIL !== 'true') return;
  openForTyped(hubName, dateKey);
  if (NO_ASK_HUBS.has(hubName)) { logger.info(`[whatsapp] ${hubName}: drum odometer — driver not asked, left for the email (${why})`); return; }
  const since = Date.now();
  setTimeout(() => {
    const p = pendingAsks.get(hubName);
    if (p && p.answeredAt && p.answeredAt >= since) {
      logger.info(`[whatsapp] ${hubName}: driver typed the reading within ${ASK_DELAY_MS / 60000} min — no need to ask`);
      return;
    }
    askDriverForReading(hubName, chatId, dateKey, why, photoMsg).catch(e => logger.warn(`[whatsapp] ask failed: ${e.message}`));
  }, ASK_DELAY_MS);
}

// An old photo re-sent as today's (2026-10-29: Scheme 3 and Misrial drivers
// forwarded earlier photos). Raftar: tell the driver it is old and ask for a
// new one. Replies to that photo with an @mention; at most once per hub per 30 min.
const lastOldPhotoNote = new Map();
async function askForFreshPhoto(hubName, chatId, photoMsg) {
  if (process.env.ASK_DRIVER_ON_FAIL !== 'true') return;
  const prev = lastOldPhotoNote.get(hubName);
  if (prev && Date.now() - prev < 30 * 60 * 1000) return;
  lastOldPhotoNote.set(hubName, Date.now());
  const authorId = photoMsg && (photoMsg.author || photoMsg._data?.author?._serialized || null);
  const authorStr = authorId ? String(authorId._serialized || authorId) : '';
  const text = mention => `${mention ? mention + ' ' : ''}Assalam o Alaikum! Ye picture purani hai. ` +
    'Meherbani kar ke abhi meter ki nayi picture bana kar bhejein.\n\nSent by Raftar';
  try {
    if (authorStr) await photoMsg.reply(text('@' + authorStr.split('@')[0]), chatId, { mentions: [authorStr] });
    else await client.sendMessage(chatId, text(''));
    logger.info(`[whatsapp] Asked ${hubName} driver for a new photo (old photo re-sent)`);
  } catch (err) {
    try { await client.sendMessage(chatId, text('')); logger.info(`[whatsapp] Asked ${hubName} group for a new photo (plain)`); }
    catch (err2) { logger.error(`[whatsapp] Could not ask ${hubName} for a new photo: ${err2?.message || err2}`); }
  }
}

async function askDriverForReading(hubName, chatId, dateKey, why, photoMsg) {
  if (process.env.ASK_DRIVER_ON_FAIL !== 'true') return;
  if (NO_ASK_HUBS.has(hubName)) return;
  const prev = pendingAsks.get(hubName);
  if (prev && prev.askedAt && Date.now() - prev.askedAt < ASK_COOLDOWN_MS) {
    logger.info(`[whatsapp] ${hubName}: driver already asked ${Math.round((Date.now() - prev.askedAt) / 60000)} min ago — not asking again`);
    return;
  }
  const authorId = photoMsg && (photoMsg.author || photoMsg._data?.author?._serialized || null);
  const authorStr = authorId ? String(authorId._serialized || authorId) : '';
  const mentionTok = authorStr ? '@' + authorStr.split('@')[0] : '';
  try {
    if (photoMsg && authorStr) {
      await photoMsg.reply(askMessageFor(mentionTok), chatId, { mentions: [authorStr] });
      logger.info(`[whatsapp] Asked ${hubName} driver (${authorStr}) to type the reading — reply + mention (${why})`);
    } else {
      await client.sendMessage(chatId, askMessageFor());
      logger.info(`[whatsapp] Asked ${hubName} group to type the reading (${why})`);
    }
    pendingAsks.set(hubName, { ...(pendingAsks.get(hubName) || {}), askedAt: Date.now(), openedAt: Date.now(), dateKey });
    savePendingAsks();
  } catch (err) {
    logger.warn(`[whatsapp] reply+mention failed for ${hubName} (${err?.message || err}) — sending plain message`);
    try {
      await client.sendMessage(chatId, askMessageFor());
      pendingAsks.set(hubName, { ...(pendingAsks.get(hubName) || {}), askedAt: Date.now(), openedAt: Date.now(), dateKey });
      savePendingAsks();
      logger.info(`[whatsapp] Asked ${hubName} group to type the reading (plain, ${why})`);
    } catch (err2) {
      logger.error(`[whatsapp] Could not ask ${hubName} group for the reading: ${err2?.message || err2}`);
    }
  }
}

// A typed reply such as "98.5", "98,5" or "98.5 km" in a hub group.
async function handleTypedReading(msg) {
  if (msg.fromMe) return;
  const { hubNameForChat } = require('../config/hubGroups');
  const hubName = hubNameForChat(msg.from);
  if (!hubName) return;
  const pending = pendingAsks.get(hubName);
  // open from the unreadable photo (openedAt) or, in files saved before 27 Oct, from the ask
  const open = !!pending && Date.now() - (pending.openedAt || pending.askedAt || 0) <= ASK_WINDOW_MS;
  const { meterTypeFor } = require('../config/hubGroups');
  const meterType = meterTypeFor(hubName);
  // up to 6 digits: Gulraiz's driver typed odometer values 41768 / 41824 on
  // 2026-10-26 and the old 4-digit pattern silently dropped both
  let m = String(msg.body || '').trim().match(/^(\d{1,6})(?:[.,](\d))?\s*(km)?$/i);
  // Nothing asked (2026-10-29: Gulraiz's FPU was filled by hand, so the
  // driver's typed LDO had no open request and was dropped without a log).
  // Unasked, a bare number counts only if it looks like a reading: a decimal
  // or "km" on a trip meter, 4-6 digits on an odometer. "ok 2" never does.
  if (m && !open && !(m[2] != null || m[3] || (meterType === 'odometer' && m[1].length >= 4))) m = null;
  // or a short sentence with one reading in it ("Ride start 41961"), same rules as a caption
  const fromText = m ? null : readingFromText(msg.body, meterType);
  if (!m && fromText == null) {
    if (/\d/.test(msg.body || '')) logger.info(`[whatsapp] ${hubName}: text "${String(msg.body).slice(0, 60)}" has no clear reading — ignored`);
    return;
  }
  const km = m ? parseFloat(`${m[1]}${m[2] != null ? '.' + m[2] : ''}`) : fromText;
  const { dateKey } = localTimeParts(msg.timestamp * 1000);
  let { localHour } = localTimeParts(msg.timestamp * 1000);
  if (open && dateKey !== pending.dateKey) return;
  if (!open) {
    // unasked: fill a blank cell only, never overwrite a recorded LDO
    const lc = require('../sheets/logisticsClient').forHub(hubName);
    const found = await lc.findHubRow(hubName, dateKey).catch(() => null);
    const ldoRaw = found ? String(found.row[lc.COL.ldo] || '').trim() : '';
    if (ldoRaw) { logger.info(`[whatsapp] ${hubName}: typed ${km} but today's LDO is already ${ldoRaw} — not overwritten`); return; }
  }
  // A reply quoting the driver's own photo is dated by that photo, so a
  // "9:10am Ride start" value typed at 12:33 still lands in FPU.
  const q = msg._data?.quotedMsg;
  if (q && Number.isFinite(q.t)) localHour = localTimeParts(q.t * 1000).localHour;
  else if (q && /start/i.test(q.caption || '')) localHour = 9;
  else if (q && /end|drop/i.test(q.caption || '')) localHour = 15;
  // the reply's own words win: "start 41961" is the FPU, "end 42010" the LDO
  if (/start/i.test(msg.body || '')) localHour = 9;
  else if (/\b(end|drop)/i.test(msg.body || '')) localHour = 15;
  const senderName = msg._data?.notifyName || msg.author || msg.from;
  logger.info(`[whatsapp] Typed reading ${km} from ${senderName} for ${hubName} (${!open ? 'not asked' : pending.askedAt ? 'answering our request' : 'after an unreadable photo'})`);
  const ok = await writeHubReading({
    hubName, km, confidence: 'typed', dateKey, localHour, senderName,
    submittedAt: new Date(msg.timestamp * 1000).toISOString(),
  });
  if (ok) { const p = pendingAsks.get(hubName); if (p) { p.answeredAt = Date.now(); savePendingAsks(); } }
  // odometer drivers answer with two numbers (start, end): close only on the LDO
  if (ok === 'LDO') { pendingAsks.delete(hubName); savePendingAsks(); }
}

// ─── Handle each incoming message ────────────────────────────────────────────
async function handleMessage(msg) {
  if (msg && msg.type === 'chat') return handleTypedReading(msg);
  if (!msg || !msg.type || msg.type !== 'image') return;

  // Skip WhatsApp Status updates (status@broadcast) — these are not KM submissions and only waste Vision quota.
  if (msg.from === 'status@broadcast' || (msg.from || '').includes('status@broadcast')) {
    logger.info('[whatsapp] Ignoring status broadcast image (not a submission)');
    return;
  }

  // NOTE: getChat()/getContact() use the same store path that throws a minified
  // "r" error on the pinned web version. We DON'T need the chat object (hub is
  // matched from msg.from below), so getChat failure must NOT abort processing.
  // getContact is best-effort too — fall back to notifyName / msg.from.
  let contact = null;
  try {
    contact = await msg.getContact();
  } catch (err) {
    logger.warn('[whatsapp] getContact failed (non-fatal), using notifyName:', err?.message || String(err));
  }

  const senderPhone = msg.from.replace('@c.us', '').replace('@g.us', '');
  const chatId = msg.from;

  // ── BOUNCER: Hard allowlist check ──────────────────────────────────────────
  if (ALLOWED_NUMBERS.length > 0 && !ALLOWED_NUMBERS.includes(senderPhone)) {
    logger.warn(`[security] BLOCKED — unauthorized sender: ${senderPhone}. Not in allowlist.`);
    return; // Hard block — no negotiation
  }

  const senderName = (contact && (contact.pushname || contact.name)) || msg._data?.notifyName || msg.from;
  const submittedAt = new Date(msg.timestamp * 1000).toISOString();
  // ISO YYYY-MM-DD in the HUBS' timezone. This is the canonical lookup key for
  // the logistics sheet — see the date-helper notes in src/sheets/logisticsClient.js.
  // The container runs in UTC, so the old `toISOString().split('T')[0]` put a
  // photo sent before 05:00 PKT on the previous day.
  const localParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: config.app.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(msg.timestamp * 1000)).map(p => [p.type, p.value]));
  const dateKey = `${localParts.year}-${localParts.month}-${localParts.day}`;
  const localHour = parseInt(localParts.hour, 10);

  // ── ROUTING: work out where this image belongs BEFORE downloading it ───────
  // Previously every chat was downloaded, decrypted and OCR'd, including
  // @newsletter job-spam channels, excluded Rawalpindi groups and personal
  // chats. That burned work on images that could never be a hub submission
  // (a personal easypaisa screenshot even OCR'd to "KM=2026" on 2026-09-08).
  const { isHubGroup, hubNameForChat } = require('../config/hubGroups');
  const hubName = hubNameForChat(chatId);

  if (!hubName) {
    // Newsletters and channels are never submissions — they also carry no
    // mediaKey, so the download could only ever fail.
    if (chatId.includes('@newsletter') || chatId.includes('@broadcast')) {
      logger.info(`[whatsapp] Skipping ${chatId} — channel/newsletter, not a hub group`);
      return;
    }
    // A non-hub group is deliberately out of scope (e.g. the Rawalpindi groups
    // listed in src/config/hubGroups.js).
    if (chatId.includes('@g.us')) {
      logger.info(`[whatsapp] Skipping non-hub group ${chatId} (${senderName})`);
      return;
    }
    // Personal chats fed the old per-person "KM Records" tab, which the sheets
    // config marks as not needed. Off by default; set PROCESS_NON_HUB_CHATS=true
    // to re-enable rather than deleting the path.
    if (process.env.PROCESS_NON_HUB_CHATS !== 'true') {
      logger.info(`[whatsapp] Skipping personal chat from ${senderName} — PROCESS_NON_HUB_CHATS not enabled`);
      return;
    }
  }

  logger.info(`[whatsapp] Image from ${senderName} at ${submittedAt} (Chat: ${chatId}${hubName ? ` → hub ${hubName}` : ''})`);

  // 1. Download image. The injected downloadMedia() throws "r" on current
  // WhatsApp Web builds, so fall back to decrypting the media ourselves from
  // mediaKey + directPath (does not depend on the broken browser Store).
  let media = null;
  try {
    media = await msg.downloadMedia();
  } catch (err) {
    logger.warn(`[whatsapp] downloadMedia() failed (${err?.message}); trying self-decrypt fallback…`);
  }

  if (!media || !media.data) {
    const d = msg._data || {};
    logger.info(`[whatsapp][DIAG] media fields — mediaKey=${d.mediaKey ? 'yes' : 'no'} directPath=${d.directPath ? 'yes' : 'no'} mimetype=${d.mimetype || msg.mimetype} type=${d.type || msg.type} size=${d.size}`);
    try {
      const { decryptWhatsAppMedia } = require('./mediaDecrypt');
      media = await decryptWhatsAppMedia(msg);
    } catch (err) {
      logger.error(`[whatsapp] self-decrypt fallback failed from ${senderName}: ${err?.message}`);
    }
  }

  if (!media || !media.data) {
    logger.error(`[whatsapp] Media download returned no data from ${senderName} (media=${media ? 'obj-no-data' : 'null'})`);
    return;
  }
  logger.info(`[whatsapp] Media obtained from ${senderName} — mimetype=${media.mimetype}, bytes~=${Math.round((media.data?.length || 0) * 0.75)}`);

  const imageBuffer = Buffer.from(media.data, 'base64');

  // A photo re-sent on a later day is not a new reading. On 2026-10-21 Misrial
  // Road's driver re-forwarded the previous evening's "73.0 km" photo (same
  // bytes) and it was written as that day's LDO.
  // Except a 0.0: a trip meter reads 0.0 every morning, so a re-sent zero photo
  // is still a true FPU (Raftar, 2026-11-02: never tell a driver a 0.0 is old).
  if (hubName && isRepeatPhoto(hubName, imageBuffer, dateKey)) {
    const { meterTypeFor } = require('../config/hubGroups');
    const r = await extractKMFromImage(imageBuffer, senderName, { hubName, meterType: meterTypeFor(hubName) }).catch(() => null);
    if (!(r && r.success && Number(r.km) === 0)) {
      if (require('../sheets/logisticsClient').isWorkday(dateKey)) await askForFreshPhoto(hubName, chatId, msg);
      return;
    }
    logger.info(`[whatsapp] ${hubName}: repeated photo shows 0.0 — morning zero, used as today's reading`);
  }

  // Feed the scheduler-visible buffer before any OCR, so a hub image is
  // available to the 10 AM / 3 PM runs even if extraction fails here.
  if (hubName) {
    bufferHubImage(hubName, imageBuffer, media.mimetype, senderName, msg.timestamp * 1000, msg);
  }

  // Save incoming meter images to disk for OCR tuning/debugging (so we can
  // re-run OCR offline without asking the sender to resend).
  try {
    const dir = require('../config/meterImageDir').meterImageDir();
    fs.mkdirSync(dir, { recursive: true });
    const safeName = String(senderName).replace(/[^\w]+/g, '_').slice(0, 20);
    const ext = (media.mimetype && media.mimetype.includes('png')) ? 'png' : 'jpg';
    const file = path.join(dir, `${Date.now()}_${safeName}.${ext}`);
    fs.writeFileSync(file, imageBuffer);
    logger.info(`[whatsapp] Saved meter image → ${file}`);

    // These now live on the persistent volume, so prune or they grow forever.
    // Filenames start with Date.now(), so a lexical sort is chronological.
    const MAX_SAVED = parseInt(process.env.METER_IMAGE_KEEP || '500', 10);
    const all = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png)$/i.test(f)).sort();
    for (const stale of all.slice(0, Math.max(0, all.length - MAX_SAVED))) {
      try { fs.unlinkSync(path.join(dir, stale)); } catch { /* best effort */ }
    }
  } catch (e) {
    logger.warn(`[whatsapp] Could not save debug image: ${e.message}`);
  }

  // 2. Extract KM via OCR (Tesseract, two-pass)
  // hubName/meter are already known here: routing happens before the download,
  // so the vision prompt can be told which kind of meter to expect.
  const { meterTypeFor } = require('../config/hubGroups');
  const extraction = await extractKMFromImage(imageBuffer, senderName, {
    hubName: hubName || 'personal chat',
    meterType: hubName ? meterTypeFor(hubName) : 'trip',
    mimeType: media.mimetype,
  });
  // The driver may have written the reading in the caption ("Ride start 41874").
  // A photo the reader can verify wins; otherwise the caption is used, so a
  // driver who already gave the number is never asked for it (2026-10-27).
  const captionKm = hubName ? readingFromText(msg.body, meterTypeFor(hubName)) : null;
  if (hubName && captionKm != null && (!extraction.success || extraction.km !== captionKm)) {
    if (extraction.success) logger.warn(`[whatsapp] ${hubName}: photo reads ${extraction.km} but caption says ${captionKm} — using the photo`);
    else {
      logger.info(`[whatsapp] ${hubName}: photo not readable, caption gives ${captionKm} — using the caption`);
      let hourForCaption = localHour;
      if (/start/i.test(msg.body || '')) hourForCaption = 9;
      else if (/\b(end|drop)/i.test(msg.body || '')) hourForCaption = 15;
      if (process.env.OCR_DRY_RUN === 'true') return;
      await writeHubReading({ hubName, km: captionKm, confidence: 'caption', dateKey, localHour: hourForCaption, senderName, submittedAt });
      return;
    }
  }
  if (!extraction.success) {
    logger.warn(`[whatsapp] Could not extract KM from ${senderName}: ${extraction.reason}`);
    // A genuine meter photo we could not read -> ask the driver to type it
    // (after a short wait, in case they are already typing it).
    // Photos with no LCD at all (traffic, car interior) are not asked about.
    if (hubName && !/no amber LCD/.test(extraction.reason || '') &&
        require('../sheets/logisticsClient').isWorkday(dateKey)) {
      askDriverLater(hubName, chatId, dateKey, extraction.reason, msg);
    }
    return;
  }

  logger.info(`[whatsapp] Extracted KM=${extraction.km} from ${senderName}`);

  // ── OCR-only test mode: extract + log KM, but DO NOT touch the sheet ─────────
  if (process.env.OCR_DRY_RUN === 'true') {
    logger.info(`[whatsapp] 🧪 DRY-RUN — OCR result: KM=${extraction.km} (confidence=${extraction.confidence ?? 'n/a'}) from ${senderName}. Sheet NOT updated.`);
    return;
  }

  // 3. Hub submission — validate, then write to the Logistics sheet
  if (hubName) {
    await writeHubReading({ hubName, km: extraction.km, confidence: extraction.confidence, dateKey, localHour, senderName, submittedAt });
    return; // a hub image is a hub image — never fall through to the personal path
  }

  // 4. Personal chat (only reachable with PROCESS_NON_HUB_CHATS=true) — validate
  const validation = validateKM(extraction.km);
  if (!validation.valid) {
    logger.warn(`[whatsapp] Invalid KM ${extraction.km} from ${senderName}: ${validation.reason}`);
    return;
  }

  // 5. Write to the per-person KM Records tab
  const record = {
    date: dateKey,
    teamMember: senderName,
    phone: msg.from,
    km: extraction.km,
    sourceMessage: `WhatsApp image — ${msg.id._serialized}`,
    submittedAt,
    status: 'submitted',
    reminderSent: 'no',
    notes: '',
  };

  const existing = await recordExists(senderName, dateKey);

  if (existing) {
    if (config.app.duplicatePolicy === 'latest') {
      await updateKMRecord(senderName, dateKey, record);
      logger.info(`[whatsapp] Updated record for ${senderName} on ${dateKey}`);
    } else {
      logger.info(`[whatsapp] Duplicate ignored for ${senderName} on ${dateKey}`);
    }
  } else {
    await writeKMRecord(record);
    logger.info(`[whatsapp] Record written — ${senderName}: ${extraction.km} KM`);
  }
}

// ─── Get the client instance ──────────────────────────────────────────────────
function getClient() {
  return client;
}

function isReady() {
  return clientReady;
}

function getQRCode() {
  return currentQRCode;
}

module.exports = { initWhatsApp, getClient, isReady, getQRCode, getRecentMessages, getLatestHubImage, hubPhotoCount, askMessageFor, askDriverForReading };
