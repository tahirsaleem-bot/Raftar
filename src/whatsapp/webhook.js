/**
 * NOT ACTIVE — Meta Cloud API webhook handler.
 * Current app uses whatsapp-web.js (src/whatsapp/whatsappClient.js) instead.
 * To activate: app.use('/webhook', require('./src/whatsapp/webhook')) in index.js
 * Requires: WHATSAPP_TOKEN env var + Meta Developer portal registration.
 */

const express = require('express');
const axios = require('axios');
const config = require('../config');
const { extractKMFromImage } = require('../vision/extractKM');
const { validateKM } = require('../validation/validateKM');
const { writeKMRecord, recordExists, updateKMRecord } = require('../sheets/sheetsClient');
const logger = require('../logger');

const router = express.Router();

// ─── Webhook Verification (Meta one-time handshake) ───────────────────────────
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.webhookVerifyToken) {
    logger.info('[webhook] Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.warn('[webhook] Webhook verification failed — token mismatch');
  return res.sendStatus(403);
});

// ─── Incoming Message Handler ─────────────────────────────────────────────────
router.post('/', async (req, res) => {
  // Acknowledge immediately — Meta requires response within 20s
  res.sendStatus(200);

  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const messages = value?.messages || [];

        for (const message of messages) {
          await handleMessage(message, value.contacts);
        }
      }
    }
  } catch (err) {
    logger.error('[webhook] Error processing incoming message:', err.message);
  }
});

// ─── Core Message Handler ─────────────────────────────────────────────────────
async function handleMessage(message, contacts) {
  const { id: messageId, type, from: senderPhone, timestamp } = message;

  // Only handle image messages
  if (type !== 'image') {
    logger.info(`[webhook] Skipping non-image message (type: ${type}) from ${senderPhone}`);
    return;
  }

  const senderName = contacts?.find(c => c.wa_id === senderPhone)?.profile?.name || senderPhone;
  const submittedAt = new Date(parseInt(timestamp) * 1000).toISOString();
  const dateKey = submittedAt.split('T')[0]; // YYYY-MM-DD

  logger.info(`[webhook] Image received from ${senderName} (${senderPhone}) at ${submittedAt}`);

  // 1. Download image from WhatsApp
  const imageBuffer = await downloadWhatsAppImage(message.image.id);
  if (!imageBuffer) {
    logger.error(`[webhook] Failed to download image for message ${messageId}`);
    return;
  }

  // 2. Extract KM via Claude Vision
  const extraction = await extractKMFromImage(imageBuffer, senderName);
  if (!extraction.success) {
    logger.warn(`[webhook] Could not extract KM from image by ${senderName}: ${extraction.reason}`);
    return;
  }

  logger.info(`[webhook] Extracted KM=${extraction.km} for ${senderName} on ${dateKey}`);

  // 3. Validate
  const validation = validateKM(extraction.km);
  if (!validation.valid) {
    logger.warn(`[webhook] Invalid KM value ${extraction.km} from ${senderName}: ${validation.reason}`);
    return;
  }

  // 4. Duplicate check
  const existing = await recordExists(senderName, dateKey);

  const record = {
    date: dateKey,
    teamMember: senderName,
    phone: senderPhone,
    km: extraction.km,
    sourceMessage: `WhatsApp image — ${messageId}`,
    submittedAt,
    status: 'submitted',
    reminderSent: 'no',
    notes: '',
  };

  if (existing) {
    if (config.app.duplicatePolicy === 'latest') {
      await updateKMRecord(senderName, dateKey, record);
      logger.info(`[webhook] Updated existing record for ${senderName} on ${dateKey} (latest policy)`);
    } else {
      logger.info(`[webhook] Duplicate ignored for ${senderName} on ${dateKey} (first policy)`);
    }
  } else {
    await writeKMRecord(record);
    logger.info(`[webhook] New record written for ${senderName} — KM: ${extraction.km}`);
  }
}

// ─── Download Image from WhatsApp Media API ───────────────────────────────────
async function downloadWhatsAppImage(mediaId) {
  try {
    // Step 1: Get media URL
    const metaRes = await axios.get(
      `${config.whatsapp.apiBaseUrl}/${mediaId}`,
      { headers: { Authorization: `Bearer ${config.whatsapp.token}` } }
    );

    const mediaUrl = metaRes.data.url;

    // Step 2: Download the actual image bytes
    const imageRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${config.whatsapp.token}` },
      responseType: 'arraybuffer',
    });

    return Buffer.from(imageRes.data);
  } catch (err) {
    logger.error('[webhook] Failed to download WhatsApp image:', err.message);
    return null;
  }
}

module.exports = router;
