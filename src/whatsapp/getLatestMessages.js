const logger = require('../logger');

async function getLatestMessagesFromGroup(client, groupId, hubName, limit = 10) {
  try {
    const chat = await client.getChatById(groupId);
    if (!chat) {
      return { hub: hubName, success: false, error: 'Chat not found' };
    }

    const messages = await chat.fetchMessages({ limit });
    if (!messages || messages.length === 0) {
      return { hub: hubName, success: true, messages: [] };
    }

    const result = messages.map(msg => ({
      from: msg.from,
      senderName: msg._data?.notifyName || msg.from,
      type: msg.type,
      timestamp: new Date(msg.timestamp * 1000).toISOString(),
      body: msg.body ? msg.body.substring(0, 100) : '',
      hasMedia: msg.hasMedia || false,
      mediaType: msg._data?.type || null,
    }));

    return {
      hub: hubName,
      success: true,
      count: result.length,
      messages: result.reverse(),
    };
  } catch (err) {
    logger.error(`[getLatestMessages] Error for ${hubName}:`, err.message);
    return { hub: hubName, success: false, error: err.message };
  }
}

module.exports = { getLatestMessagesFromGroup };
