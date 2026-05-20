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

// ─── Initialize WhatsApp Client ───────────────────────────────────────────────
function initWhatsApp() {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './credentials/whatsapp-session-active' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
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
      const qrImagePath = path.join(__dirname, '../../qrcode.png');
      await QRCode.toFile(qrImagePath, qr, { width: 300, margin: 1 });
      logger.info(`[whatsapp] QR code saved to: ${qrImagePath}`);
      console.log(`\n✅ QR Code saved to: ${qrImagePath}`);
    } catch (err) {
      logger.error('[whatsapp] Failed to save QR code image:', err.message);
    }
  });

  client.on('authenticated', () => {
    logger.info('[whatsapp] Authenticated — session saved');
  });

  client.on('ready', () => {
    clientReady = true;
    logger.info('[whatsapp] Client ready — listening for messages');
    console.log('\n✔ WhatsApp connected and ready!\n');
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

  // ── Handle incoming messages ────────────────────────────────────────────────
  client.on('message', async msg => {
    try {
      if (!msg || !msg.type) return;
      await handleMessage(msg);
    } catch (err) {
      logger.error('[whatsapp] Error handling message:', err.message);
    }
  });

  client.initialize();
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

// ─── Handle each incoming message ────────────────────────────────────────────
async function handleMessage(msg) {
  if (!msg || !msg.type || msg.type !== 'image') return;

  const chat = await msg.getChat();
  const contact = await msg.getContact();
  const senderPhone = msg.from.replace('@c.us', '').replace('@g.us', '');
  const chatId = msg.from;

  // ── BOUNCER: Hard allowlist check ──────────────────────────────────────────
  if (ALLOWED_NUMBERS.length > 0 && !ALLOWED_NUMBERS.includes(senderPhone)) {
    logger.warn(`[security] BLOCKED — unauthorized sender: ${senderPhone}. Not in allowlist.`);
    return; // Hard block — no negotiation
  }

  const senderName = contact.pushname || contact.name || msg.from;
  const submittedAt = new Date(msg.timestamp * 1000).toISOString();
  const dateKey = submittedAt.split('T')[0];

  logger.info(`[whatsapp] Image from ${senderName} at ${submittedAt} (Chat: ${chatId})`);

  // 1. Download image
  const media = await msg.downloadMedia();
  if (!media) {
    logger.error(`[whatsapp] Failed to download media from ${senderName}`);
    return;
  }

  const imageBuffer = Buffer.from(media.data, 'base64');

  // 2. Extract KM via Gemini Vision
  const extraction = await extractKMFromImage(imageBuffer, senderName);
  if (!extraction.success) {
    logger.warn(`[whatsapp] Could not extract KM from ${senderName}: ${extraction.reason}`);
    return;
  }

  logger.info(`[whatsapp] Extracted KM=${extraction.km} from ${senderName}`);

  // 3. Check if from GROUP — identify hub
  const { HUB_GROUPS } = require('../config/hubGroups');
  let hubName = null;
  for (const hub of HUB_GROUPS) {
    if (hub.groupId === chatId) {
      hubName = hub.hubName;
      break;
    }
  }

  // If from group, update Logistics sheet directly
  if (hubName) {
    try {
      const { updateFPU, updateLDOAndTotal } = require('../sheets/logisticsClient');
      const hour = new Date(msg.timestamp * 1000).getHours();

      // Before 12 noon = FPU, after = LDO
      if (hour < 12) {
        await updateFPU(hubName, dateKey, extraction.km);
        logger.info(`[whatsapp] Updated FPU for ${hubName}: ${extraction.km}`);
      } else {
        await updateLDOAndTotal(hubName, dateKey, extraction.km);
        logger.info(`[whatsapp] Updated LDO for ${hubName}: ${extraction.km}`);
      }
      return; // Done — don't process further
    } catch (err) {
      logger.error(`[whatsapp] Failed to update sheet for ${hubName}:`, err.message);
    }
  }

  // 3. Validate
  const validation = validateKM(extraction.km);
  if (!validation.valid) {
    logger.warn(`[whatsapp] Invalid KM ${extraction.km} from ${senderName}: ${validation.reason}`);
    return;
  }

  // 4. Write to Google Sheets
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

module.exports = { initWhatsApp, getClient, isReady, getQRCode };
