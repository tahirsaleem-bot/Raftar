const { getClient, isReady } = require('../src/whatsapp/whatsappClient');
const { HUB_GROUPS } = require('../src/config/hubGroups');
const logger = require('../src/logger');

async function fetchLatestMessages() {
  const maxAttempts = 30;
  let attempts = 0;

  // Wait for WhatsApp client to be ready
  while (!isReady() && attempts < maxAttempts) {
    console.log(`⏳ Waiting for WhatsApp connection... (${attempts + 1}/${maxAttempts})`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }

  if (!isReady()) {
    console.error('❌ WhatsApp client not ready after 30 seconds');
    process.exit(1);
  }

  console.log('✅ WhatsApp connected!\n');

  const client = getClient();

  try {
    console.log('📱 Latest messages from hub groups:\n');
    console.log('='.repeat(80));

    for (const hub of HUB_GROUPS) {
      try {
        const chat = await client.getChatById(hub.groupId);
        if (!chat) {
          console.log(`\n❌ ${hub.hubName}: Chat not found`);
          continue;
        }

        const messages = await chat.fetchMessages({ limit: 5 });

        console.log(`\n📍 ${hub.hubName}`);
        console.log('-'.repeat(80));

        if (messages && messages.length > 0) {
          // Reverse to show oldest first
          messages.reverse().forEach((msg, idx) => {
            const timestamp = new Date(msg.timestamp * 1000).toLocaleString('en-PK');
            const contact = msg._data.notifyName || msg.from;
            const type = msg.type === 'image' ? '🖼️ Image' :
                        msg.type === 'text' ? '📝 Text' : `📎 ${msg.type}`;
            const content = msg.body ? msg.body.substring(0, 60) : '(no content)';

            console.log(`  ${idx + 1}. [${timestamp}] ${contact} — ${type}`);
            if (msg.body) console.log(`     "${content}${msg.body.length > 60 ? '...' : ''}"`);
          });
        } else {
          console.log('  (No messages in this group)');
        }
      } catch (err) {
        logger.error(`Failed to fetch messages from ${hub.hubName}:`, err.message);
        console.log(`  ⚠️ Error: ${err.message}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    process.exit(0);
  } catch (err) {
    logger.error('Failed to fetch messages:', err);
    console.error('Error:', err.message);
    process.exit(1);
  }
}

fetchLatestMessages();
