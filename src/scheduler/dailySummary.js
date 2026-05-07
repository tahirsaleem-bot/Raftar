const cron = require('node-cron');
const { sendEmail } = require('../gmail/gmailClient');
const { getAllRows, todaySheetDate } = require('../sheets/logisticsClient');
const { HUB_GROUPS } = require('../config/hubGroups');
const logger = require('../logger');

const MANAGER_EMAIL = process.env.MANAGER_EMAIL || '';
const TIMEZONE = process.env.TIMEZONE || 'Asia/Karachi';

async function runDailySummary() {
  if (!MANAGER_EMAIL) {
    logger.warn('[summary] MANAGER_EMAIL not set — skipping daily summary email');
    return;
  }

  const dateStr = todaySheetDate(TIMEZONE);
  logger.info(`[summary] Building daily summary for ${dateStr}`);

  let rows;
  try {
    rows = await getAllRows();
  } catch (err) {
    logger.error('[summary] Could not fetch sheet rows:', err.message);
    return;
  }

  const todayRows = rows.filter(r => (r[1] || '').trim() === dateStr);
  const allHubs = HUB_GROUPS.map(h => h.hubName);

  const fpuHubs = todayRows
    .filter(r => r[9] && r[9].trim() && r[9].trim().toLowerCase() !== 'off')
    .map(r => (r[4] || '').trim());
  const ldoHubs = todayRows
    .filter(r => r[10] && r[10].trim() && r[10].trim().toLowerCase() !== 'off')
    .map(r => (r[4] || '').trim());

  const fpuMissing = allHubs.filter(h => !fpuHubs.includes(h));
  const ldoMissing = allHubs.filter(h => !ldoHubs.includes(h));

  const lines = [
    `Raftar Daily KM Summary — ${dateStr}`,
    '',
    `FPU Submitted (${fpuHubs.length}/${allHubs.length}): ${fpuHubs.join(', ') || 'none'}`,
    `FPU Missing: ${fpuMissing.join(', ') || 'none'}`,
    '',
    `LDO Submitted (${ldoHubs.length}/${allHubs.length}): ${ldoHubs.join(', ') || 'none'}`,
    `LDO Missing: ${ldoMissing.join(', ') || 'none'}`,
    '',
    'Sent by Raftar',
  ];

  const result = await sendEmail({
    to: MANAGER_EMAIL,
    subject: `Raftar KM Summary — ${dateStr}`,
    body: lines.join('\n'),
  });

  if (result.success) {
    logger.info(`[summary] Daily summary sent to ${MANAGER_EMAIL}`);
  } else {
    logger.error(`[summary] Failed to send summary: ${result.error}`);
  }
}

function startSummaryScheduler() {
  const summaryTime = process.env.SUMMARY_TIME || '18:00';
  const [hour, minute] = summaryTime.split(':').map(Number);
  logger.info(`[summary] Daily summary scheduler — runs at ${summaryTime} PKT`);
  cron.schedule(`${minute} ${hour} * * *`, () => {
    runDailySummary().catch(err => logger.error('[summary] Cron error:', err.message));
  }, { timezone: TIMEZONE });
}

module.exports = { startSummaryScheduler, runDailySummary };
