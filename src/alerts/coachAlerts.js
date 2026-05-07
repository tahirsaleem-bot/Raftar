const { sendEmail } = require('../gmail/gmailClient');
const { getTeamMembers } = require('../validation/validateKM');
const logger = require('../logger');

/**
 * Send email alerts to coaches with missing or overdue readings
 * Usage: await sendCoachEmailAlerts({ type: 'missing', hoursOverdue: 12 })
 */
async function sendCoachEmailAlerts({ type = 'missing', hoursOverdue = 12 } = {}) {
  try {
    const teamMembers = getTeamMembers();
    if (teamMembers.length === 0) {
      logger.warn('[alerts] Team members list is empty — cannot send alerts');
      return { success: false, error: 'Team members list not populated', sent: [] };
    }

    const sent = [];
    const failed = [];

    for (const coach of teamMembers) {
      try {
        const subject = buildSubject(type, hoursOverdue);
        const body = buildEmailBody(coach.name, type, hoursOverdue);

        const result = await sendEmail({
          to: coach.email || coach.phone, // Use email if available, fallback to phone
          subject,
          body,
        });

        if (result.success) {
          sent.push({ coach: coach.name, messageId: result.messageId });
          logger.info(`[alerts] Email sent to ${coach.name} (${coach.email || coach.phone})`);
        } else {
          failed.push({ coach: coach.name, error: result.error });
          logger.warn(`[alerts] Failed to send to ${coach.name}: ${result.error}`);
        }
      } catch (err) {
        failed.push({ coach: coach.name, error: err.message });
        logger.error(`[alerts] Error sending to ${coach.name}:`, err.message);
      }
    }

    return {
      success: sent.length > 0,
      sent,
      failed,
      summary: `${sent.length} sent, ${failed.length} failed`,
    };
  } catch (err) {
    logger.error('[alerts] Fatal error sending coach alerts:', err.message);
    return { success: false, error: err.message, sent: [] };
  }
}

/**
 * Send alert to a specific coach
 */
async function sendCoachAlert(coachPhone, { type = 'missing', hoursOverdue = 12 } = {}) {
  try {
    const teamMembers = getTeamMembers();
    const coach = teamMembers.find(m => m.phone === coachPhone);

    if (!coach) {
      return { success: false, error: `Coach with phone ${coachPhone} not found` };
    }

    const subject = buildSubject(type, hoursOverdue);
    const body = buildEmailBody(coach.name, type, hoursOverdue);

    const result = await sendEmail({
      to: coach.email || coach.phone,
      subject,
      body,
    });

    if (result.success) {
      logger.info(`[alerts] Alert sent to ${coach.name}`);
      return { success: true, messageId: result.messageId };
    } else {
      logger.warn(`[alerts] Failed to send to ${coach.name}: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (err) {
    logger.error('[alerts] Error sending alert:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Build email subject based on alert type
 */
function buildSubject(type, hoursOverdue) {
  if (type === 'missing') {
    return `⚠️ Missing Meter Reading — Please Submit ASAP`;
  }
  if (type === 'overdue') {
    return `📍 Overdue: Meter reading missing for ${hoursOverdue} hours`;
  }
  return 'Raftar — Reading Submission Required';
}

/**
 * Build email body in Roman Urdu (as per project requirements)
 */
function buildEmailBody(coachName, type, hoursOverdue) {
  const now = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });

  let message = '';
  if (type === 'missing') {
    message = `
Assalamu Alaikum ${coachName},

Aapka aaj ka meter reading abhi submit nahi hua hai.

Kripaya jaldi se apne vehicle ka meter photo WhatsApp par bhej kar submit kar dain.

---
Raftar Meter Reading System
Current Time: ${now}
Sent by Raftar
    `.trim();
  } else if (type === 'overdue') {
    message = `
Assalamu Alaikum ${coachName},

Aapka meter reading ${hoursOverdue} ghante se submit nahi hua hai. Yeh bohot zaroori hai.

Kripaya abhi bhej dain!

---
Raftar Meter Reading System
Current Time: ${now}
Sent by Raftar
    `.trim();
  }

  return message;
}

module.exports = { sendCoachEmailAlerts, sendCoachAlert };
