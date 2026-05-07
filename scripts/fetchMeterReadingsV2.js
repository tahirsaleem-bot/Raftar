require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const { extractKMFromImage } = require('../src/vision/extractKM');
const { HUB_GROUPS } = require('../src/config/hubGroups');
const logger = require('../src/logger');

async function fetchMeterReadings() {
  console.log('\n🔄 Initializing WhatsApp client...\n');

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './credentials/whatsapp-session' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    },
  });

  return new Promise((resolve, reject) => {
    client.on('ready', async () => {
      console.log('✅ WhatsApp connected\n');

      const readings = [];

      try {
        const chats = await client.getChats();
        console.log(`📱 Found ${chats.length} chats\n`);

        // Process each hub group
        for (const hub of HUB_GROUPS) {
          const chat = chats.find(c => c.id._serialized === hub.groupId);

          if (!chat) {
            console.log(`⚠️  Group not found: "${hub.hubName}" (${hub.groupId})`);
            continue;
          }

          console.log(`\n📌 ${hub.hubName}`);
          console.log(`   Group ID: ${hub.groupId}`);

          try {
            // Fetch last 50 messages from this group
            const messages = await chat.fetchMessages({ limit: 50 });
            console.log(`   Messages fetched: ${messages.length}`);

            let imageCount = 0;
            let kmCount = 0;

            for (const msg of messages) {
              if (msg.type === 'image' && msg.hasMedia) {
                try {
                  imageCount++;
                  const contact = await msg.getContact();
                  const senderName = contact.pushname || contact.name || msg.from;
                  const msgTime = new Date(msg.timestamp * 1000);
                  const timeStr = msgTime.toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });

                  console.log(`   📷 Image from ${senderName} (${timeStr})`);

                  const media = await msg.downloadMedia();
                  if (!media) {
                    console.log(`      ❌ Failed to download`);
                    continue;
                  }

                  const imageBuffer = Buffer.from(media.data, 'base64');
                  const extraction = await extractKMFromImage(imageBuffer, senderName);

                  if (extraction.success) {
                    console.log(`      ✅ KM: ${extraction.km}`);
                    kmCount++;
                    readings.push({
                      hub: hub.hubName,
                      sender: senderName,
                      phone: msg.from,
                      km: extraction.km,
                      timestamp: msgTime.toISOString(),
                      time: timeStr,
                      messageId: msg.id._serialized,
                    });
                  } else {
                    console.log(`      ⚠️  Could not extract: ${extraction.reason}`);
                  }
                } catch (err) {
                  console.log(`      ❌ Error: ${err.message}`);
                }
              }
            }

            if (imageCount === 0) {
              console.log(`   No images found`);
            } else {
              console.log(`   → Total images: ${imageCount}, Extracted: ${kmCount}`);
            }
          } catch (err) {
            console.log(`   ❌ Error fetching messages: ${err.message}`);
          }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📊 METER READINGS SUMMARY');
        console.log('='.repeat(60));
        console.log(`\nTotal readings extracted: ${readings.length}\n`);

        if (readings.length > 0) {
          readings.forEach((r, i) => {
            console.log(`${i + 1}. [${r.hub}] ${r.sender} — ${r.km} KM`);
            console.log(`   Time: ${r.time}\n`);
          });
        } else {
          console.log('No meter readings found in any group.\n');
        }

        console.log('='.repeat(60) + '\n');

        await client.destroy();
        resolve(readings);
      } catch (err) {
        console.error('❌ Error:', err.message);
        await client.destroy();
        reject(err);
      }
    });

    client.on('disconnected', () => {
      console.log('WhatsApp disconnected');
      reject(new Error('WhatsApp disconnected'));
    });

    client.initialize().catch(reject);
  });
}

// Run if called directly
if (require.main === module) {
  fetchMeterReadings()
    .then(data => {
      console.log('✅ Script completed\n');
      process.exit(0);
    })
    .catch(err => {
      console.error('Script failed:', err.message);
      process.exit(1);
    });
}

module.exports = { fetchMeterReadings };
