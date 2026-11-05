const cron = require('node-cron');
const { getClient, isReady, getLatestHubImage } = require('../whatsapp/whatsappClient');
const { extractKMFromImage } = require('../vision/extractKM');
const { updateLDOAndTotal, todayISO, getLastReading, getFPU } = require('../sheets/logisticsClient');
const { ALL_HUBS } = require('../config/hubGroups');
const { forHub } = require('../sheets/logisticsClient');
const { validateHubKM, validateTripDay } = require('../validation/validateKM');
const logger = require('../logger');

// Look back 8 hours for images
const LOOKBACK_HOURS = 8;


// Epoch ms for the start of today, and for noon today, in TIMEZONE. Used to pick
// the right buffered image: a morning photo for FPU, an afternoon one for LDO.
function dayBoundsMs(timezone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now);
  const g = {};
  parts.forEach(p => { g[p.type] = p.value; });
  const secsIntoDay = (+g.hour) * 3600 + (+g.minute) * 60 + (+g.second);
  const startOfDay = now.getTime() - secsIntoDay * 1000;
  return { startOfDay, noon: startOfDay + 12 * 3600 * 1000 };
}

// ─── Fetch the latest image from a group ──────────────────────────────────────
// Prefers the live buffer fed by the message handler: the NEWEST photo of the
// day. It used to look only after noon, which missed Khawaja's 52.4 sent at
// 11:53 on 2026-10-20. A re-sent morning photo cannot become the LDO:
// processHub skips a reading equal to today's FPU, and validateTripDay
// rejects one below it.
// The window.Store path below is a fallback that currently always fails.
async function fetchLatestImageFromGroup(groupId, hubName) {
  if (hubName) {
    const { startOfDay } = dayBoundsMs(process.env.TIMEZONE || 'Asia/Karachi');
    const hit = getLatestHubImage(hubName, { sinceMs: startOfDay });
    if (hit) {
      logger.info(`[ldo] Using buffered image for ${hubName} from ${hit.senderName} at ${new Date(hit.ts).toISOString()}`);
      return hit.buffer;
    }
    logger.info(`[ldo] No buffered image today for ${hubName} — trying the store`);
  }
  return fetchLatestImageFromStore(groupId);
}

async function fetchLatestImageFromStore(groupId) {
  const client = getClient();
  if (!client || !isReady()) {
    logger.warn('[ldo] WhatsApp client not ready');
    return null;
  }

  const cutoff = Date.now() / 1000 - LOOKBACK_HOURS * 60 * 60;

  try {
    const msgId = await client.pupPage.evaluate(async (groupId, cutoff) => {
      const chat = window.Store.Chat.get(groupId);
      if (!chat) return null;
      const msgs = chat.msgs.models || [];
      const images = msgs.filter(m => m.type === 'image' && m.t >= cutoff);
      images.sort((a, b) => b.t - a.t);
      if (!images.length) return null;
      return images[0].id._serialized;
    }, groupId, cutoff);

    if (!msgId) return null;

    const msg = await client.getMessageById(msgId);
    if (!msg) return null;

    const media = await msg.downloadMedia();
    if (!media) return null;

    return Buffer.from(media.data, 'base64');
  } catch (err) {
    logger.error(`[ldo] Error fetching image from ${groupId}: ${err.message.split('\n')[0]}`);
    return null;
  }
}

// ─── Process one hub ──────────────────────────────────────────────────────────
async function processHub(hub, dateStr) {
  logger.info(`[ldo] Checking ${hub.hubName}`);

  const imageBuffer = await fetchLatestImageFromGroup(hub.groupId, hub.hubName);
  if (!imageBuffer) {
    logger.warn(`[ldo] No image found for ${hub.hubName}`);
    return;
  }

  const extraction = await extractKMFromImage(imageBuffer, hub.hubName, { hubName: hub.hubName, meterType: hub.meter });
  if (!extraction.success) {
    logger.warn(`[ldo] Could not extract KM for ${hub.hubName}: ${extraction.reason}`);
    return;
  }

  logger.info(`[ldo] Extracted LDO=${extraction.km} for ${hub.hubName}`);

  // Validate before writing — bounds depend on the hub's meter type, so OCR
  // noise cannot reach the sheet (see validateHubKM).
  let lastReading = null;
  try {
    lastReading = await forHub(hub.hubName).getLastReading(hub.hubName, dateStr);
  } catch (err) {
    logger.warn(`[ldo] Could not read last ${hub.hubName} reading: ${err.message}`);
  }

  const check = validateHubKM(hub.hubName, extraction.km, { lastReading });
  if (!check.valid) {
    logger.warn(`[ldo] REJECTED ${hub.hubName}: ${check.reason} — sheet not touched`);
    return;
  }

  if (check.warning) logger.warn(`[ldo] ${hub.hubName}: ${check.warning}`);

  { // trip and odometer alike: Total = LDO - FPU
    let fpu = null;
    try { fpu = await forHub(hub.hubName).getFPU(hub.hubName, dateStr); } catch (err) {
      logger.warn(`[ldo] Could not read today's ${hub.hubName} FPU: ${err.message}`);
    }
    if (fpu != null && check.km === fpu) {
      logger.info(`[ldo] ${hub.hubName}: latest photo shows ${check.km} = today's FPU — no evening photo yet`);
      return;
    }
    const day = validateTripDay(hub.hubName, check.km, fpu);
    if (!day.valid) {
      logger.warn(`[ldo] REJECTED ${hub.hubName}: ${day.reason} — sheet not touched`);
      return;
    }
  }

  const result = await forHub(hub.hubName).updateLDOAndTotal(hub.hubName, dateStr, check.km);
  if (result.success) {
    logger.info(`[ldo] ✔ ${hub.hubName} | FPU:${result.fpu} LDO:${result.ldo} Total:${result.total} km`);
  } else {
    logger.error(`[ldo] Failed to update sheet for ${hub.hubName}: ${result.reason}`);
  }
}

// ─── Run full LDO check ───────────────────────────────────────────────────────
async function runLDOCheck() {
  // ISO — canonical lookup key (was todaySheetDate(), which never matched).
  const dateStr = todayISO(process.env.TIMEZONE || 'Asia/Karachi');
  if (!require('../sheets/logisticsClient').isWorkday(dateStr)) {
    logger.info(`[ldo] ${dateStr} is a weekend — no LDO check (Mon-Fri only)`);
    return;
  }
  logger.info(`[ldo] Starting LDO check for ${dateStr}`);

  for (const hub of ALL_HUBS()) {
    try {
      await processHub(hub, dateStr);
    } catch (err) {
      logger.error(`[ldo] Error for ${hub.hubName}: ${err.message}`);
    }
  }

  logger.info('[ldo] LDO check complete');
}

// ─── Start 3 PM cron ─────────────────────────────────────────────────────────
function startLDOScheduler() {
  const checkTime = process.env.LDO_CHECK_TIME || '15:00';
  const [hour, minute] = checkTime.split(':').map(Number);
  const cronExpr = `${minute} ${hour} * * *`;

  logger.info(`[ldo] LDO scheduler started — runs daily at ${checkTime} PKT`);

  cron.schedule(cronExpr, () => {
    runLDOCheck().catch(err => logger.error('[ldo] Cron error:', err.message));
  }, {
    timezone: process.env.TIMEZONE || 'Asia/Karachi',
  });
}

module.exports = { startLDOScheduler, runLDOCheck };
