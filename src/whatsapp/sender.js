const { getClient, isReady } = require('./whatsappClient');
const logger = require('../logger');

// ─── Send a text message to a phone number or group ──────────────────────────
async function sendMessage(chatId, text) {
  if (!isReady()) {
    logger.error('[sender] WhatsApp client not ready');
    return { success: false, error: 'WhatsApp not connected' };
  }

  try {
    const client = getClient();
    // Ensure chatId has correct format (e.g. 923001234567@c.us for individual)
    const id = chatId.includes('@') ? chatId : `${chatId}@c.us`;
    const msg = await client.sendMessage(id, text);
    logger.info(`[sender] Message sent to ${chatId} — id: ${msg.id._serialized}`);
    return { success: true, messageId: msg.id._serialized };
  } catch (err) {
    logger.error(`[sender] Failed to send to ${chatId}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── Send KM reminder to a team member ───────────────────────────────────────
async function sendKMReminder(phone, memberName, isSecondReminder = false) {
  const greeting = isSecondReminder ? 'Final reminder' : 'Reminder';
  const text =
    `${greeting}: Hi ${memberName}, your daily KM report has not been received yet.\n\n` +
    `Please send a photo of your odometer or GPS reading as soon as possible.\n\n` +
    `Thank you!`;

  return sendMessage(phone, text);
}

// ─── Send escalation to manager ───────────────────────────────────────────────
async function sendManagerEscalation(managerPhone, missingMembers, dateStr) {
  const names = missingMembers.map(m => `• ${m.name}`).join('\n');
  const text =
    `KM Report Alert — ${dateStr}\n\n` +
    `The following team members have not submitted their KM report:\n\n` +
    `${names}\n\n` +
    `Reminders have been sent. Please follow up if needed.`;

  return sendMessage(managerPhone, text);
}

module.exports = { sendMessage, sendKMReminder, sendManagerEscalation };
