const cron = require('node-cron');
const { getClient, isReady, getLatestHubImage, askDriverForReading } = require('../whatsapp/whatsappClient');
const { extractKMFromImage } = require('../vision/extractKM');
const { addDailyRows, updateFPU, todayISO, getLastReading } = require('../sheets/logisticsClient');
const { ALL_HUBS } = require('../config/hubGroups');
const { forFleet, forHub } = require('../sheets/logisticsClient');
const { validateHubKM } = require('../validation/validateKM');
const logger = require('../logger');


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

// ─── Fetch latest image from a group ─────────────────────────────────────────
// Prefers the live buffer fed by the message handler. The window.Store path
// below is kept only as a fallback; on the pinned web version it throws
// "Cannot read properties of undefined (reading 'Chat')".
async function fetchLatestImageFromGroup(groupId, hubName) {
  if (hubName) {
    const { startOfDay } = dayBoundsMs(process.env.TIMEZONE || 'Asia/Karachi');
    const hit = getLatestHubImage(hubName, { sinceMs: startOfDay });
    if (hit) {
      logger.info(`[fpu] Using buffered image for ${hubName} from ${hit.senderName} at ${new Date(hit.ts).toISOString()}`);
      return hit.buffer;
    }
    logger.info(`[fpu] No buffered image for ${hubName} today — trying the store`);
  }
  return fetchLatestImageFromStore(groupId);
}

async function fetchLatestImageFromStore(groupId) {
  const client = getClient();
  if (!client || !isReady()) return null;

  try {
    // Method: Use Puppeteer to directly access messages from store
    const imageData = await client.pupPage.evaluate(async (gId) => {
      if (!window.Store || !window.Store.Chat) return null;

      const chat = window.Store.Chat.get(gId);
      if (!chat || !chat.msgs) return null;

      try {
        // Get all message models
        const msgModels = chat.msgs.models || Object.values(chat.msgs._models || {});
        if (!msgModels.length) return null;

        // Filter images
        const images = msgModels.filter(m =>
          m && m.type === 'image' && m.mediaObject && m.mediaObject.mediaBlob
        );

        if (!images.length) return null;

        // Sort by timestamp (newest first)
        images.sort((a, b) => (b.timestamp || b.t || 0) - (a.timestamp || a.t || 0));

        // Return message ID of latest image
        return images[0].id ? images[0].id._serialized : images[0]._serialized;
      } catch (e) {
        return null;
      }
    }, groupId);

    if (!imageData) return null;

    // Download the image by message ID
    const msg = await client.getMessageById(imageData);
    if (!msg) return null;

    const media = await msg.downloadMedia();
    if (!media || !media.data) return null;

    return Buffer.from(media.data, 'base64');
  } catch (err) {
    logger.warn(`[fpu] fetchLatestImageFromGroup ${groupId}: ${err.message.split('\n')[0]}`);
    return null;
  }
}

// ─── Send reminder to a group ─────────────────────────────────────────────────
// Roman Urdu + the `Sent by Raftar` signature, per CLAUDE.md rules 4 and 5.
const FPU_REMINDER_TEXT = [
  'Assalam o Alaikum. Subah ki meter reading ki photo share kar dein. 📸',
  '',
  'Sent by Raftar',
].join('\n');


// DISABLED BY DEFAULT: CLAUDE.md rule 1 requires explicit approval before any
// WhatsApp message goes out, so this only sends when FPU_REMINDERS_ENABLED=true.
// Until then it logs exactly what it would have sent.
// (This function already existed but runFPUCheck() never called it — dead code,
// which is why no hub group has ever received a reminder.)
async function sendReminder(groupId, hubName) {
  if (process.env.FPU_REMINDERS_ENABLED !== 'true') {
    logger.info(`[fpu] Reminder for ${hubName} NOT sent — FPU_REMINDERS_ENABLED is not true`);
    return;
  }
  const client = getClient();
  if (!client || !isReady()) {
    logger.warn(`[fpu] Cannot send reminder to ${hubName} — WhatsApp not ready`);
    return;
  }
  try {
    await client.sendMessage(groupId, FPU_REMINDER_TEXT);
    logger.info(`[fpu] Reminder sent to ${hubName}`);
  } catch (err) {
    logger.error(`[fpu] Failed to send reminder to ${hubName}: ${err.message.split('\n')[0]}`);
  }
}

// ─── Run 10 AM FPU check ──────────────────────────────────────────────────────
async function runFPUCheck() {
  // ISO — the canonical lookup key. This was todaySheetDate() (DD-MM), which the
  // sheet reads back as MM-DD, so every single row lookup missed.
  const dateStr = todayISO(process.env.TIMEZONE || 'Asia/Karachi');
  if (!require('../sheets/logisticsClient').isWorkday(dateStr)) {
    logger.info(`[fpu] ${dateStr} is a weekend — no rows, no FPU check (Mon-Fri only)`);
    return;
  }
  logger.info(`[fpu] Starting FPU check for ${dateStr}`);

  // one block per fleet tab (Islamabad, Rawalpindi)
  for (const fleetKey of ['islamabad', 'rawalpindi']) await forFleet(fleetKey).addDailyRows(dateStr);

  for (const hub of ALL_HUBS()) {
    try {
      logger.info(`[fpu] Checking ${hub.hubName}`);
      const lc = forHub(hub.hubName);
      // Already filled (photo handler, a driver's typed reply, or by hand):
      // never overwrite it with a re-read of whichever photo came last.
      if ((await lc.getFPU(hub.hubName, dateStr)) != null) { logger.info(`[fpu] ${hub.hubName}: FPU already recorded`); continue; }
      const imageBuffer = await fetchLatestImageFromGroup(hub.groupId, hub.hubName);

      if (!imageBuffer) {
        logger.warn(`[fpu] No image for ${hub.hubName}`);
        await sendReminder(hub.groupId, hub.hubName);
        continue;
      }

      const extraction = await extractKMFromImage(imageBuffer, hub.hubName, { hubName: hub.hubName, meterType: hub.meter });
      if (!extraction.success) {
        logger.warn(`[fpu] Could not extract KM for ${hub.hubName}`);
        // FPU still blank at 10 AM and the photo cannot be read (sun-washed
        // white LCD, 2026-10-29): ask the driver now, replying to that photo.
        // Photos with no LCD are not asked about when they arrive (traffic pics),
        // so this is the point where an empty FPU gets its question.
        const ent = getLatestHubImage(hub.hubName);
        await askDriverForReading(hub.hubName, hub.groupId, dateStr, 'FPU still blank at 10 AM, photo not readable', ent && ent.msg)
          .catch(e => logger.warn(`[fpu] ask failed for ${hub.hubName}: ${e.message}`));
        continue;
      }

      let lastReading = null;
      try {
        lastReading = await lc.getLastReading(hub.hubName, dateStr);
      } catch (err) {
        logger.warn(`[fpu] Could not read last ${hub.hubName} reading: ${err.message}`);
      }

      const check = validateHubKM(hub.hubName, extraction.km, { lastReading });
      if (!check.valid) {
        logger.warn(`[fpu] REJECTED ${hub.hubName}: ${check.reason} — sheet not touched`);
        continue;
      }

      if (check.warning) logger.warn(`[fpu] ${hub.hubName}: ${check.warning}`);

      const result = await lc.updateFPU(hub.hubName, dateStr, check.km);
      if (!result || result.success !== true) {
        logger.error(`[fpu] ✖ ${hub.hubName} FPU write FAILED: ${result?.reason || 'row not found'}`);
        continue;
      }
      logger.info(`[fpu] ✔ ${hub.hubName} FPU: ${check.km}`);
    } catch (err) {
      logger.error(`[fpu] Error for ${hub.hubName}: ${err.message}`);
    }
  }

  logger.info('[fpu] FPU check complete');
}

// ─── Start 10 AM cron ────────────────────────────────────────────────────────
function startFPUScheduler() {
  const checkTime = process.env.FPU_CHECK_TIME || '10:00';
  const [hour, minute] = checkTime.split(':').map(Number);
  const cronExpr = `${minute} ${hour} * * *`;

  logger.info(`[fpu] FPU scheduler started — runs daily at ${checkTime} PKT`);

  cron.schedule(cronExpr, () => {
    runFPUCheck().catch(err => logger.error('[fpu] Cron error:', err.message));
  }, {
    timezone: process.env.TIMEZONE || 'Asia/Karachi',
  });
}

module.exports = { startFPUScheduler, runFPUCheck };
