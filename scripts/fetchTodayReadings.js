#!/usr/bin/env node

/**
 * Fetch today's meter readings from all WhatsApp groups
 * Usage: node scripts/fetchTodayReadings.js
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const { HUB_GROUPS } = require('../src/config/hubGroups');
const { extractKMFromImage } = require('../src/vision/extractKM');
const { validateKM } = require('../src/validation/validateKM');
const { writeKMRecord, recordExists, updateKMRecord } = require('../src/sheets/sheetsClient');
const config = require('../src/config');
const logger = require('../src/logger');

let client = null;
const TODAY = new Date().toISOString().split('T')[0];

// ─── Initialize WhatsApp Client ───────────────────────────────────────────────
async function initClient() {
  return new Promise((resolve, reject) => {
    client = new Client({
      authStrategy: new LocalAuth({ dataPath: './credentials/whatsapp-session' }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      },
    });

    client.on('ready', () => {
      logger.info('[fetchTodayReadings] WhatsApp client ready');
      resolve(client);
    });

    client.on('error', (err) => {
      logger.error('[fetchTodayReadings] Client error:', err.message);
      reject(err);
    });

    client.initialize();
  });
}

// ─── Fetch messages from a group ──────────────────────────────────────────────
async function fetchGroupMessages(groupId, hubName) {
  try {
    const chat = await client.getChatById(groupId);
    if (!chat) {
      logger.warn(`[fetchTodayReadings] Could not find chat: ${groupId}`);
      return [];
    }

    const messages = await chat.fetchMessages({ limit: 100 });
    const todayMessages = messages.filter(msg => {
      const msgDate = new Date(msg.timestamp * 1000).toISOString().split('T')[0];
      return msgDate === TODAY && msg.type === 'image';
    });

    logger.info(`[fetchTodayReadings] Found ${todayMessages.length} images in ${hubName}`);
    return todayMessages;
  } catch (err) {
    logger.error(`[fetchTodayReadings] Error fetching from ${hubName}:`, err.message);
    return [];
  }
}

// ─── Process image message ───────────────────────────────────────────────────
async function processImage(msg, hubName) {
  try {
    const contact = await msg.getContact();
    const senderName = contact.pushname || contact.name || msg.from;
    const submittedAt = new Date(msg.timestamp * 1000).toISOString();
    const dateKey = submittedAt.split('T')[0];

    logger.info(`[fetchTodayReadings] Processing: ${senderName} from ${hubName}`);

    // Download image
    const media = await msg.downloadMedia();
    if (!media) {
      logger.error(`[fetchTodayReadings] Failed to download image from ${senderName}`);
      return null;
    }

    const imageBuffer = Buffer.from(media.data, 'base64');

    // Extract KM
    const extraction = await extractKMFromImage(imageBuffer, senderName);
    if (!extraction.success) {
      logger.warn(`[fetchTodayReadings] Could not extract KM from ${senderName}: ${extraction.reason}`);
      return null;
    }

    logger.info(`[fetchTodayReadings] ✓ Extracted: ${senderName} = ${extraction.km} KM`);

    // Validate
    const validation = validateKM(extraction.km);
    if (!validation.valid) {
      logger.warn(`[fetchTodayReadings] Invalid KM ${extraction.km} from ${senderName}`);
      return null;
    }

    // Write to sheets
    const record = {
      date: dateKey,
      teamMember: senderName,
      phone: msg.from,
      km: extraction.km,
      sourceMessage: `WhatsApp image — ${msg.id._serialized}`,
      submittedAt,
      status: 'submitted',
      reminderSent: 'no',
      hub: hubName,
      notes: `Fetched from ${hubName} group`,
    };

    const existing = await recordExists(senderName, dateKey);
    if (existing) {
      if (config.app.duplicatePolicy === 'latest') {
        await updateKMRecord(senderName, dateKey, record);
        logger.info(`[fetchTodayReadings] Updated: ${senderName}`);
      }
    } else {
      await writeKMRecord(record);
      logger.info(`[fetchTodayReadings] Written: ${senderName} → ${extraction.km} KM`);
    }

    return { senderName, km: extraction.km, hub: hubName };
  } catch (err) {
    logger.error(`[fetchTodayReadings] Error processing image:`, err.message);
    return null;
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════');
  console.log(`  Fetching Readings for ${TODAY}`);
  console.log('═══════════════════════════════════════\n');

  try {
    await initClient();
    logger.info('[fetchTodayReadings] Client initialized');

    const allResults = [];

    // Process each hub group
    for (const hub of HUB_GROUPS) {
      console.log(`\n📱 Checking ${hub.hubName}...`);
      const messages = await fetchGroupMessages(hub.groupId, hub.hubName);

      for (const msg of messages) {
        const result = await processImage(msg, hub.hubName);
        if (result) {
          allResults.push(result);
          console.log(`   ✓ ${result.senderName}: ${result.km} KM`);
        }
      }
    }

    console.log('\n═══════════════════════════════════════');
    console.log(`  Summary: ${allResults.length} readings processed`);
    console.log('═══════════════════════════════════════\n');

    if (allResults.length > 0) {
      console.log('Readings added:');
      allResults.forEach(r => {
        console.log(`  • ${r.senderName} (${r.hub}): ${r.km} KM`);
      });
    } else {
      console.log('No readings found for today.');
    }

  } catch (err) {
    logger.error('[fetchTodayReadings] Fatal error:', err.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.destroy();
    }
    process.exit(0);
  }
}

main();
