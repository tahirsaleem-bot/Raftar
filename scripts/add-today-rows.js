#!/usr/bin/env node

require('dotenv').config();

const { addDailyRows, todaySheetDate } = require('./src/sheets/logisticsClient');
const logger = require('./src/logger');

// Hub → Coach mapping
const COACH_MAP = {
  'E-9 AHQ': 'Javeria, Hafsa, Zarmeen',
  'lane 6': 'Sehar, Maria, Waleed',
  'Khawaja corporation': 'Meerab, Hira',
  'Tramri Chowk': 'Ridda Abbas, Moiz Khan',
  'H-13 Tarnol': 'Iqra & Hamza Siddique',
  'I-10 Tarnol': 'Sana Nawaz, Abubakr',
  'Misrial Road': 'Saman & Iqra Arshad, M Salman',
};

async function main() {
  try {
    const dateStr = todaySheetDate('Asia/Karachi');

    // Check if today is weekend (Saturday=6, Sunday=0)
    const today = new Date();
    const dayOfWeek = today.getDay();

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      logger.info(`⏸️  Weekend detected (${dayOfWeek === 0 ? 'Sunday' : 'Saturday'}) — skipping row creation`);
      return;
    }

    logger.info(`📅 Adding rows for today: ${dateStr}`);
    logger.info('👥 Including coach names for each hub...');

    await addDailyRows(dateStr, COACH_MAP);

    logger.info(`✅ Done! Rows added for ${dateStr}`);
    logger.info(`📊 7 hubs + coaches added`);

  } catch (err) {
    logger.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

main();
