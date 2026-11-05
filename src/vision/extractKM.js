const { createWorker } = require('tesseract.js');
const logger = require('../logger');
const { preprocessForOdometer } = require('./preprocessLcd');

// ─── OFFLINE OCR (Tesseract) ──────────────────────────────────────────────────
// Free, no API, no quota. Reads digits from odometer / GPS screenshots locally.
// Gemini Vision version kept as backup in extractKM.gemini.bak.js.
//
// Two-pass strategy for real meter photos:
//   Pass A (primary): crop to the amber odometer LCD + binarize, then OCR with a
//     DIGITS-ONLY whitelist. This stops Tesseract grabbing the analog speedo dial
//     numbers (80/100/120/140) instead of the real reading.
//   Pass B (fallback): ONLY for screenshots that literally print "<number> km"
//     (GPS/trip apps). It must never guess at a photo of a dashboard.
//
// WHY PASS B IS NOW NARROW (rewritten 2026-09-08 from real production logs):
// Pass B used to take the LARGEST number anywhere in the image. On a dashboard
// photo the analog dial markings (20/40/…/140) are crisply printed, so Tesseract
// reads them far more reliably than the real LCD — and the largest of them won.
// Live examples, all wrong:
//   malikshoukatawan11 -> "8 2 … 120% … 140=" -> KM=140   (dial max marking)
//   Tahir Iqbal        -> "50 80 km/h 100 120%" -> KM=359
//   mahtab azam        -> "80 km/h 20 100% 1207 140" -> KM=1207
//   Fatima123 (a school notice about board markers) -> KM=3, confidence=medium
// This is exactly the mistake the odometer rule warns about: the KM is ALWAYS on
// the amber LCD, and the dial numbers are SPEED. So:
//   * Pass A is trusted only when the amber LCD was actually found and cropped.
//     Digits-only OCR over an uncropped frame just reads the dial too.
//   * Pass B accepts only an explicit "<number> km" (and never "km/h").
//   * Text-heavy images (notices, receipts, chat screenshots) are rejected up front.
// When neither pass can prove a reading we return failure, so the cell stays
// blank for manual entry. Writing a dial number into a live sheet is far worse
// than writing nothing.
//
// NOTE: First run downloads the English trained-data + wasm core once (needs
// internet that one time), cached under ./.tesseract_cache for reuse.

let workerPromise = null;
let digitWorkerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, { cachePath: './.tesseract_cache' })
      .catch(err => { workerPromise = null; throw err; });
  }
  return workerPromise;
}

async function getDigitWorker() {
  if (!digitWorkerPromise) {
    digitWorkerPromise = (async () => {
      const w = await createWorker('eng', 1, { cachePath: './.tesseract_cache' });
      await w.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: '6', // assume a uniform block of text
      });
      return w;
    })().catch(err => { digitWorkerPromise = null; throw err; });
  }
  return digitWorkerPromise;
}

// ─── Extract KM/odometer reading from an image ────────────────────────────────
// Claude vision first when a credential is configured — it can tell the amber
// LCD from the analog dial, which is the one thing Tesseract reliably gets
// wrong. Falls back to the Tesseract passes below when no key is set, or when
// the vision call fails for any reason (network, quota, refusal).
// `opts` carries hub context for the vision prompt: { hubName, meterType, mimeType }.
async function extractKMFromImage(imageBuffer, senderName = 'Unknown', opts = {}) {
  try {
    const claude = require('./readMeterWithClaude');
    if (claude.isEnabled() && process.env.METER_VISION !== 'tesseract') {
      const r = await claude.readMeterWithClaude(imageBuffer, { ...opts, senderName });
      if (r.success) return r;
      // "not a meter" is a definite verdict from a model that can actually see
      // the image — don't let Tesseract overrule it with a dial number.
      if (/^Not a meter image/.test(r.reason || '')) return r;
      logger.warn(`[vision] Claude vision unavailable for ${senderName} (${r.reason}) — falling back to Tesseract`);
    }
  } catch (err) {
    logger.warn(`[vision] Claude vision path errored for ${senderName}: ${err.message} — falling back to Tesseract`);
  }

  // ── Seven-segment reader (offline, built for the Alto trip LCD) ─────────────
  // Every hub vehicle shows the same amber LCD. Tesseract cannot read seven-
  // segment digits — on 2026-10-20 it failed 8 of 9 hub photos and misread the
  // ninth — so hub photos are read ONLY by readSevenSeg, which refuses rather
  // than guesses. A refusal leaves the cell blank for manual entry.
  try {
    const { readMeter } = require('./readSevenSeg');
    const r = await readMeter(imageBuffer, { integer: opts.meterType === 'odometer' });
    if (r.ok) {
      logger.info(`[vision] KM=${r.km} via seven-segment LCD reader ("${r.text} km") for ${senderName}`);
      return { success: true, km: r.km, confidence: 'high', source: 'sevenseg' };
    }
    logger.info(`[vision] Seven-segment reader declined for ${senderName}: ${r.reason}`);
    if (opts.hubName && opts.hubName !== 'personal chat') { // hub photo: LCD reader is final
      return { success: false, reason: `LCD not readable: ${r.reason} — needs manual entry` };
    }
  } catch (err) {
    logger.warn(`[vision] Seven-segment reader errored for ${senderName}: ${err.message}`);
    if (opts.hubName && opts.hubName !== 'personal chat') { // hub photo: LCD reader is final
      return { success: false, reason: `LCD reader error: ${err.message} — needs manual entry` };
    }
  }

  try {
    // ── Pass A: cropped amber LCD, digits only ───────────────────────────────
    let cropped = false;
    try {
      const pre = await preprocessForOdometer(imageBuffer);
      cropped = pre.cropped;
      const digitWorker = await getDigitWorker();
      const { data: dd } = await digitWorker.recognize(pre.buffer);
      const dtext = (dd && dd.text) ? dd.text : '';
      logger.info(`[vision] Pass A (LCD${cropped ? '/cropped' : ''}) digits for ${senderName}: ${dtext.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
      const km = pickOdometerDigits(dtext);
      // Without a successful amber-LCD crop this pass is reading the whole
      // dashboard, dial included, so its digits prove nothing.
      if (km !== null && !cropped) {
        logger.warn(`[vision] Pass A found ${km} for ${senderName} but the amber LCD was NOT located — discarding (would likely be a dial number)`);
      } else if (km !== null) {
        const conf = dd && typeof dd.confidence === 'number' ? dd.confidence : 0;
        const digits = String(km).length;
        const confidence = (digits >= 5 && conf >= 60) ? 'high'
          : (digits >= 5 || conf >= 55) ? 'medium' : 'low';
        logger.info(`[vision] KM=${km} via Pass A (cropped LCD, confidence=${confidence}, raw=${Math.round(conf)}) for ${senderName}`);
        return { success: true, km, confidence, source: 'lcd' };
      }
    } catch (err) {
      logger.warn(`[vision] Pass A failed for ${senderName}: ${err.message}`);
    }

    // ── Pass B: full image, plain OCR + largest-number heuristic ─────────────
    const worker = await getWorker();
    const { data } = await worker.recognize(imageBuffer);
    const text = data && data.text ? data.text : '';
    logger.info(`[vision] Pass B (full) text for ${senderName}: ${text.replace(/\s+/g, ' ').trim().slice(0, 160)}`);

    // A meter photo yields short numeric fragments and noise. A wall of real
    // words means this is a notice / receipt / chat screenshot, not a meter.
    const words = (text.match(/[a-z]{3,}/gi) || []).length;
    if (words > 15) {
      logger.info(`[vision] Rejecting image from ${senderName} — looks like text (${words} words), not a meter`);
      return { success: false, reason: `Not a meter image (${words} words of text detected)` };
    }

    const km = pickOdometer(text);
    if (km === null) {
      return { success: false, reason: 'Amber LCD not found and no explicit "<number> km" in the image — needs manual entry' };
    }
    const conf = data && typeof data.confidence === 'number' ? data.confidence : 0;
    const confidence = 'low'; // an explicit "<n> km" without an LCD crop is never better than low
    logger.info(`[vision] KM=${km} via Pass B ("<n> km" match, confidence=${confidence}, raw=${Math.round(conf)}) for ${senderName}`);
    return { success: true, km, confidence, source: 'km-label' };
  } catch (err) {
    logger.error(`[vision] Tesseract error for ${senderName}:`, err.message);
    return { success: false, reason: `OCR error: ${err.message}` };
  }
}

// ─── Pick odometer from a digits-only OCR pass ────────────────────────────────
// Odometers are typically 4–7 digit whole numbers. Prefer the longest token
// (most digits), tie-break by the largest value. Ignore short dial-like numbers.
function pickOdometerDigits(text) {
  if (!text) return null;

  // A trip hub's MORNING reading is a legitimate ZERO: the driver resets the
  // meter each morning, so the LCD literally shows "00" (confirmed by Tahir
  // 2026-09-08 for Misrial Road, and every trip hub's FPU column is 0).
  // The >=3-digit / >=100 rules below would throw that away, so a reading of
  // 0 could NEVER be extracted no matter how good the crop was. Handle it
  // first: an LCD whose digits are nothing but zeros IS zero.
  // Safety: 0 is rejected downstream for odometer hubs (validateHubKM's
  // ODO_MIN), so a spurious "0" cannot corrupt G-13 or Tramri Chowk.
  const digitsOnly = text.replace(/\D/g, '');
  if (digitsOnly.length > 0 && /^0+$/.test(digitsOnly)) return 0;

  const tokens = text.match(/\d{3,7}/g); // ignore 1–2 digit noise (dial ticks are ≤3)
  if (!tokens || tokens.length === 0) return null;
  const nums = tokens
    .map(t => parseInt(t, 10))
    .filter(n => Number.isFinite(n) && n >= 100 && n <= 2000000);
  if (nums.length === 0) return null;
  // Prefer longest digit string, then largest value.
  nums.sort((a, b) => {
    const la = String(a).length, lb = String(b).length;
    if (lb !== la) return lb - la;
    return b - a;
  });
  return nums[0];
}

// ─── Pick an odometer value from full-image OCR text ──────────────────────────
// STRICT: only an explicit "<number> km" counts, e.g. a GPS/trip app screenshot
// reading "104 km". Everything else returns null so the caller reports failure.
//
// The old version fell back to `Math.max()` over every number in the image,
// which is why dashboard photos yielded dial markings (140, 120, 100).
//
// "km/h" and "mph" are SPEED, never distance. The previous regex ended in ,
// and in "80 km/h" the "/" is itself a word boundary — so it happily matched
// and returned 80. The lookahead below is what stops that.
function pickOdometer(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  const kmMatch = lower.match(/([\d][\d.,]{0,12})\s*k\s*m(?!\s*\/?\s*h)\b/);
  if (!kmMatch) return null;

  const v = normalizeNumber(kmMatch[1]);
  if (v === null || v < 1 || v > 2000000) return null;
  return Math.round(v);
}

// ─── Normalize a raw numeric token (handles 1,234.5 / 1.234,5 / 12,345) ───────
function normalizeNumber(raw) {
  if (!raw) return null;
  let s = raw.replace(/\s+/g, '');
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  }

  s = s.replace(/\.+$/, '').replace(/^\.+/, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

module.exports = { extractKMFromImage };
