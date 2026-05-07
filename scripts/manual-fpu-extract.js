const { getClient, isReady } = require('../src/whatsapp/whatsappClient');
const { extractKMFromImage } = require('../src/vision/extractKM');
const { HUB_GROUPS } = require('../src/config/hubGroups');

async function manualFPUExtract() {
  if (!isReady()) {
    console.log('WhatsApp not ready');
    return;
  }

  console.log('\n=== MANUAL FPU EXTRACTION ===\n');

  const client = getClient();
  const results = [];

  for (const hub of HUB_GROUPS) {
    try {
      console.log(`📍 Checking ${hub.hubName}...`);

      const chat = await client.getChatById(hub.groupId);
      if (!chat) {
        console.log(`  ❌ Chat not found\n`);
        continue;
      }

      const messages = await chat.fetchMessages({ limit: 50 });
      const imageMessages = messages.filter(m => m.hasMedia && m.type === 'image');

      if (!imageMessages.length) {
        console.log(`  ❌ No images found\n`);
        continue;
      }

      const latestImage = imageMessages[0];
      console.log(`  📸 Found image at ${latestImage.timestamp * 1000}`);

      const media = await latestImage.downloadMedia();
      if (!media) {
        console.log(`  ❌ Could not download\n`);
        continue;
      }

      const imageBuffer = Buffer.from(media.data, 'base64');
      const extraction = await extractKMFromImage(imageBuffer, hub.hubName);

      if (extraction.success) {
        console.log(`  ✅ KM: ${extraction.km}\n`);
        results.push({ hub: hub.hubName, km: extraction.km, success: true });
      } else {
        console.log(`  ❌ Extraction failed\n`);
        results.push({ hub: hub.hubName, success: false });
      }
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}\n`);
    }
  }

  console.log('\n=== RESULTS ===');
  console.table(results);
}

manualFPUExtract().catch(console.error);
