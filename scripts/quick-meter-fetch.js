// Quick script to fetch meter readings using server-initialized WhatsApp client
const path = require('path');

// Set env vars before requiring anything
process.env.TIMEZONE = 'Asia/Karachi';

const { runFPUCheck } = require('./src/scheduler/fpuChecker');
const { runLDOCheck } = require('./src/scheduler/ldoChecker');
const { getClient, initWhatsApp } = require('./src/whatsapp/whatsappClient');
const logger = require('./src/logger');

async function fetchReadings() {
  console.log('\n📱 Fetching Today\'s Meter Readings\n');

  // Initialize WhatsApp first (same as server does)
  console.log('Initializing WhatsApp...');
  await initWhatsApp();

  // Wait for WhatsApp to be ready
  let retries = 0;
  while (retries < 10) {
    const client = getClient();
    if (client && client.isReady && client.isReady()) {
      console.log('✅ WhatsApp ready!\n');
      break;
    }
    console.log(`Waiting for WhatsApp... (${retries + 1}/10)`);
    await new Promise(r => setTimeout(r, 1000));
    retries++;
  }

  try {
    console.log('1️⃣  Fetching FPU (10 AM) readings...\n');
    await runFPUCheck();
    console.log('\n✅ FPU readings complete!\n');
  } catch (err) {
    console.error('❌ FPU error:', err.message);
    logger.error('[meter-fetch] FPU error:', err.message);
  }

  try {
    console.log('2️⃣  Fetching LDO (3 PM) readings...\n');
    await runLDOCheck();
    console.log('\n✅ LDO readings complete!\n');
  } catch (err) {
    console.error('❌ LDO error:', err.message);
    logger.error('[meter-fetch] LDO error:', err.message);
  }

  console.log('✨ Done! Check Google Sheet for updated readings.\n');
  process.exit(0);
}

fetchReadings().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
