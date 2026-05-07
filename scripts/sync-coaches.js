#!/usr/bin/env node

require('dotenv').config();

const { getAllRows } = require('./src/sheets/logisticsClient');
const logger = require('./src/logger');

async function main() {
  try {
    logger.info('📖 Reading existing coach data from sheet...');

    const rows = await getAllRows();
    const coachMap = {};

    // Extract hub-coach mapping from existing data
    for (const row of rows) {
      const date = row[1];
      const coaches = row[3];
      const hub = row[4];

      if (hub && coaches && !coachMap[hub]) {
        coachMap[hub] = coaches;
        logger.info(`✓ Found: ${hub} → ${coaches}`);
      }
    }

    // Show mapping
    logger.info('\n📋 Coach Mapping:');
    Object.entries(coachMap).forEach(([hub, coach]) => {
      logger.info(`   ${hub}: ${coach}`);
    });

    // Save to env or file
    logger.info('\n✅ Ready to use in add-today-rows.js');

  } catch (err) {
    logger.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

main();
