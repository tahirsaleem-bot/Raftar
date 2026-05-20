const { getClient, isReady } = require('./whatsappClient');
const { extractKMFromImage } = require('../vision/extractKM');
const { HUB_GROUPS } = require('../config/hubGroups');
const logger = require('../logger');

async function getTodayMeterings() {
  if (!isReady()) {
    console.log('WhatsApp client not ready yet. Waiting...');
    return [];
  }

  const client = getClient();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const results = [];

  console.log(`\n📸 Fetching today's (${today}) meter readings from 7 hubs...\n`);

  // Wait for chats to load properly
  await new Promise(resolve => setTimeout(resolve, 2000));

  for (const hub of HUB_GROUPS) {
    try {
      console.log(`🔍 Checking: ${hub.hubName}...`);

      let chat = null;
      try {
        chat = await client.getChatById(hub.groupId);
      } catch (err) {
        console.log(`  ⚠️ Could not access group: ${hub.hubName} - ${err.message}`);
        continue;
      }

      if (!chat) {
        console.log(`  ⚠️ Group not found: ${hub.hubName}`);
        continue;
      }

      // Fetch last 100 messages from group with timeout
      let messages = [];
      try {
        messages = await Promise.race([
          chat.fetchMessages({ limit: 100 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 10000))
        ]);
      } catch (err) {
        console.log(`  ⚠️ Could not fetch messages from ${hub.hubName}: ${err.message}`);
        continue;
      }

      // Filter: images from today only
      const todayImages = messages.filter(msg => {
        if (!msg.hasMedia || msg.type !== 'image') return false;
        const msgDate = new Date(msg.timestamp * 1000).toISOString().split('T')[0];
        return msgDate === today;
      });

      if (todayImages.length === 0) {
        console.log(`  ❌ No images today`);
        continue;
      }

      console.log(`  ✅ Found ${todayImages.length} image(s)`);

      // Extract KM from each image
      for (const msg of todayImages) {
        try {
          const contact = await msg.getContact();
          const senderName = contact.pushname || contact.name || msg.from;
          const media = await msg.downloadMedia();

          if (!media) {
            console.log(`    ⚠️ Could not download image from ${senderName}`);
            continue;
          }

          const imageBuffer = Buffer.from(media.data, 'base64');
          const extraction = await extractKMFromImage(imageBuffer, senderName);

          if (extraction.success) {
            const msgTime = new Date(msg.timestamp * 1000).toLocaleTimeString('en-PK');
            results.push({
              hub: hub.hubName,
              sender: senderName,
              km: extraction.km,
              confidence: extraction.confidence || 'unknown',
              time: msgTime,
              messageId: msg.id._serialized,
            });
            console.log(`    ✅ ${senderName}: ${extraction.km} KM (${extraction.confidence || 'unknown'} confidence)`);
          } else {
            console.log(`    ⚠️ ${senderName}: Could not extract KM - ${extraction.reason}`);
          }
        } catch (err) {
          logger.error(`[getTodayMeterings] Error processing image:`, err.message);
        }
      }
    } catch (err) {
      console.log(`  ❌ Error accessing ${hub.hubName}:`, err.message);
      logger.error(`[getTodayMeterings] Error fetching messages from ${hub.hubName}:`, err.message);
    }
  }

  // Display summary
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 AAJKE METER READINGS (${today})`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (results.length === 0) {
    console.log('❌ Koi photos nhi aaya aaj');
    return results;
  }

  // Group by hub
  const byHub = {};
  results.forEach(r => {
    if (!byHub[r.hub]) byHub[r.hub] = [];
    byHub[r.hub].push(r);
  });

  // Display grouped
  for (const [hubName, readings] of Object.entries(byHub)) {
    console.log(`\n🏢 ${hubName}`);
    console.log(`${'─'.repeat(50)}`);
    readings.forEach(r => {
      console.log(`  📍 ${r.sender}`);
      console.log(`     KM: ${r.km}`);
      console.log(`     Confidence: ${r.confidence}`);
      console.log(`     Time: ${r.time}`);
    });
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Total: ${results.length} readings found\n`);

  return results;
}

// If called directly from CLI
if (require.main === module) {
  setTimeout(async () => {
    const results = await getTodayMeterings();
    process.exit(0);
  }, 3000); // Wait 3 seconds for WhatsApp to be ready
}

module.exports = { getTodayMeterings };
