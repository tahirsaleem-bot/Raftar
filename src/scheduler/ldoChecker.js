const cron = require('node-cron');
const { getClient, isReady } = require('../whatsapp/whatsappClient');
const { extractKMFromImage } = require('../vision/extractKM');
const { updateLDOAndTotal, todaySheetDate } = require('../sheets/logisticsClient');
const { HUB_GROUPS } = require('../config/hubGroups');
const logger = require('../logger');

// Look back 8 hours for images
const LOOKBACK_HOURS = 8;

// ─── Fetch the latest image from a group using existing client ────────────────
async function fetchLatestImageFromGroup(groupId) {
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

  const imageBuffer = await fetchLatestImageFromGroup(hub.groupId);
  if (!imageBuffer) {
    logger.warn(`[ldo] No image found for ${hub.hubName}`);
    return;
  }

  const extraction = await extractKMFromImage(imageBuffer, hub.hubName);
  if (!extraction.success) {
    logger.warn(`[ldo] Could not extract KM for ${hub.hubName}: ${extraction.reason}`);
    return;
  }

  logger.info(`[ldo] Extracted LDO=${extraction.km} for ${hub.hubName}`);

  const result = await updateLDOAndTotal(hub.hubName, dateStr, extraction.km);
  if (result.success) {
    logger.info(`[ldo] ✔ ${hub.hubName} | FPU:${result.fpu} LDO:${result.ldo} Total:${result.total} km`);
  } else {
    logger.error(`[ldo] Failed to update sheet for ${hub.hubName}: ${result.reason}`);
  }
}

// ─── Run full LDO check ───────────────────────────────────────────────────────
async function runLDOCheck() {
  const dateStr = todaySheetDate(process.env.TIMEZONE || 'Asia/Karachi');
  logger.info(`[ldo] Starting LDO check for ${dateStr}`);

  for (const hub of HUB_GROUPS) {
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
