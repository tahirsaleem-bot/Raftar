#!/usr/bin/env node

require('dotenv').config();

const { getClient, isReady } = require('./src/whatsapp/whatsappClient');
const logger = require('./src/logger');

async function main() {
  try {
    const client = getClient();

    if (!client || !isReady()) {
      logger.error('❌ WhatsApp not connected!');
      process.exit(1);
    }

    logger.info('📋 Fetching all groups...');

    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup);

    logger.info(`✅ Found ${groups.length} groups:\n`);

    groups.forEach((group, i) => {
      logger.info(`${i + 1}. ${group.name}`);
      logger.info(`   ID: ${group.id._serialized}`);
      logger.info(`   Participants: ${group.participants.length}\n`);
    });

  } catch (err) {
    logger.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

main();
