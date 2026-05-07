const cron = require('node-cron');
const { getClient, isReady } = require('../whatsapp/whatsappClient');
const { extractKMFromImage } = require('../vision/extractKM');
const { addDailyRows, updateFPU, todaySheetDate } = require('../sheets/logisticsClient');
const { HUB_GROUPS } = require('../config/hubGroups');
const logger = require('../logger');

// ─── Fetch latest image from a group ─────────────────────────────────────────
async function fetchLatestImageFromGroup(groupId) {
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
async function sendReminder(groupId, hubName) {
  const client = getClient();
  if (!client || !isReady()) return;
  try {
    await client.sendMessage(groupId, 'Please share your morning start reading. 📸');
    logger.info(`[fpu] Reminder sent to ${hubName}`);
  } catch (err) {
    logger.error(`[fpu] Failed to send reminder to ${hubName}: ${err.message.split('\n')[0]}`);
  }
}

// ─── Run 10 AM FPU check ──────────────────────────────────────────────────────
async function runFPUCheck() {
  const dateStr = todaySheetDate(process.env.TIMEZONE || 'Asia/Karachi');
  logger.info(`[fpu] Starting FPU check for ${dateStr}`);

  await addDailyRows(dateStr);

  for (const hub of HUB_GROUPS) {
    try {
      logger.info(`[fpu] Checking ${hub.hubName}`);
      const imageBuffer = await fetchLatestImageFromGroup(hub.groupId);

      if (!imageBuffer) {
        logger.warn(`[fpu] No image for ${hub.hubName}`);
        continue;
      }

      const extraction = await extractKMFromImage(imageBuffer, hub.hubName);
      if (!extraction.success) {
        logger.warn(`[fpu] Could not extract KM for ${hub.hubName}`);
        continue;
      }

      await updateFPU(hub.hubName, dateStr, extraction.km);
      logger.info(`[fpu] ✔ ${hub.hubName} FPU: ${extraction.km}`);
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
