const { runFPUCheck } = require('./src/scheduler/fpuChecker');
const { runLDOCheck } = require('./src/scheduler/ldoChecker');
const logger = require('./src/logger');

async function fetchTodayReadings() {
  console.log('\n📱 Fetching Today\'s Meter Readings from WhatsApp Groups\n');

  try {
    console.log('1️⃣  Fetching FPU (10 AM) readings...');
    await runFPUCheck();
    console.log('✅ FPU readings fetched and updated\n');
  } catch (err) {
    console.error('❌ FPU fetch failed:', err.message);
    logger.error('[fetch] FPU error:', err.message);
  }

  try {
    console.log('2️⃣  Fetching LDO (3 PM) readings...');
    await runLDOCheck();
    console.log('✅ LDO readings fetched and updated\n');
  } catch (err) {
    console.error('❌ LDO fetch failed:', err.message);
    logger.error('[fetch] LDO error:', err.message);
  }

  console.log('✨ Done! Check Google Sheet for updated readings.');
  process.exit(0);
}

fetchTodayReadings().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
