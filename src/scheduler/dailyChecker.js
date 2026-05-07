const cron = require('node-cron');
const config = require('../config');
const { getTeamMembers } = require('../validation/validateKM');
const { getSubmittedMembersForDate, markReminderSent } = require('../sheets/sheetsClient');
const { sendKMReminder } = require('../whatsapp/sender');
const logger = require('../logger');

// ─── Parse cutoff time into cron expression ───────────────────────────────────
function timeToCron(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number);
  return `${minute} ${hour} * * *`;
}

// ─── Run the daily missing-report check ──────────────────────────────────────
async function runDailyCheck(isSecondReminder = false) {
  const today = getTodayDate();
  const teamMembers = getTeamMembers();

  if (teamMembers.length === 0) {
    logger.warn('[scheduler] Team member list is empty — skipping daily check. Add members to validateKM.js');
    return;
  }

  logger.info(`[scheduler] Running daily check for ${today} (second reminder: ${isSecondReminder})`);

  const submitted = await getSubmittedMembersForDate(today);
  const submittedLower = submitted.map(n => n.toLowerCase());

  const missing = teamMembers.filter(
    m => !submittedLower.includes(m.name.toLowerCase())
  );

  if (missing.length === 0) {
    logger.info(`[scheduler] All ${teamMembers.length} members submitted KM for ${today}. No reminders needed.`);
    return;
  }

  logger.info(`[scheduler] ${missing.length} member(s) missing for ${today}: ${missing.map(m => m.name).join(', ')}`);

  for (const member of missing) {
    try {
      if (!member.phone) {
        logger.warn(`[scheduler] No phone for ${member.name} — skipping`);
        continue;
      }

      const result = await sendKMReminder(member.phone, member.name, isSecondReminder);

      if (result.success) {
        await markReminderSent(member.name, today, isSecondReminder ? 'second' : 'first');
        logger.info(`[scheduler] Reminder sent to ${member.name}`);
      } else {
        logger.error(`[scheduler] Reminder failed for ${member.name}: ${result.error}`);
      }
    } catch (err) {
      logger.error(`[scheduler] Unexpected error for ${member.name}: ${err.message}`);
    }
  }
}

// ─── Start all scheduled jobs ─────────────────────────────────────────────────
function startScheduler() {
  const [cutoffHour, cutoffMinute] = config.app.dailyCutoffTime.split(':').map(Number);
  const secondReminderHour = (cutoffHour + config.app.reminderDelayHours) % 24;

  const firstCron = `${cutoffMinute} ${cutoffHour} * * *`;
  const secondCron = `${cutoffMinute} ${secondReminderHour} * * *`;

  logger.info(`[scheduler] First reminder cron: ${firstCron} (${config.app.timezone})`);
  logger.info(`[scheduler] Second reminder cron: ${secondCron} (${config.app.timezone})`);

  // First reminder at cutoff time
  cron.schedule(firstCron, () => runDailyCheck(false), {
    timezone: config.app.timezone,
  });

  // Second reminder after delay
  cron.schedule(secondCron, () => runDailyCheck(true), {
    timezone: config.app.timezone,
  });

  logger.info('[scheduler] Daily check scheduler started');
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function getTodayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: config.app.timezone }); // YYYY-MM-DD
}

module.exports = { startScheduler, runDailyCheck };
