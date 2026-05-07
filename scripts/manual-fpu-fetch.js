#!/usr/bin/env node

require('dotenv').config();

const { runFPUCheck } = require('./src/scheduler/fpuChecker');
const logger = require('./src/logger');

async function main() {
  try {
    logger.info('🔄 Manually triggering FPU check...');
    await runFPUCheck();
    logger.info('✅ FPU check completed');
  } catch (err) {
    logger.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

main();
