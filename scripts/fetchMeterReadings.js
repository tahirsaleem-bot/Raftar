require('dotenv').config();
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { extractKMFromImage } = require('../src/vision/extractKM');
const logger = require('../src/logger');

let readings = [];

async function fetchMeterReadings() {
  console.log('🔄 Initializing WhatsApp client...');

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

      try {
        // Get all chats
        const chats = await client.getChats();
        console.log(`📱 Found ${chats.length} chats\n`);

        // Find "Buscaro x Niete" community and its groups
        let communityChat = null;
        let groupChats = [];

        for (const chat of chats) {
          // Check if it's a community
          if (chat.isCommunity && chat.name && chat.name.includes('Buscaro') && chat.name.includes('Niete')) {
            communityChat = chat;
            console.log(`✅ Found Community: "${chat.name}"\n`);

            // Get group chats within this community
            const allGroups = chats.filter(c => c.isGroup);
            for (const group of allGroups) {
              // Community groups have parentGroupId
              if (group.parentGroupId === communityChat.id._serialized) {
                groupChats.push(group);
              }
            }
            break;
          }
        }

        if (!communityChat) {
          console.log('❌ Community "Buscaro x Niete" not found');
          await client.destroy();
          resolve([]);
          return;
        }

        console.log(`📂 Found ${groupChats.length} groups in community\n`);

        // Fetch latest images from each group
        for (const group of groupChats) {
          console.log(`\n📌 Checking group: "${group.name}"`);

          const messages = await group.fetchMessages({ limit: 50 });

          for (const msg of messages) {
            if (msg.type === 'image' && msg.hasMedia) {
              try {
                const contact = await msg.getContact();
                const senderName = contact.pushname || contact.name || msg.from;
                const msgTime = new Date(msg.timestamp * 1000);

                console.log(`  📷 Image from ${senderName} at ${msgTime.toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`);

                const media = await msg.downloadMedia();
                if (!media) {
                  console.log(`    ❌ Failed to download media`);
                  continue;
                }

                const imageBuffer = Buffer.from(media.data, 'base64');

                // Extract KM using Gemini Vision
                const extraction = await extractKMFromImage(imageBuffer, senderName);

                if (extraction.success) {
                  console.log(`    ✅ Extracted KM: ${extraction.km}`);
                  readings.push({
                    group: group.name,
                    sender: senderName,
                    phone: msg.from,
                    km: extraction.km,
                    timestamp: msgTime.toISOString(),
                    messageId: msg.id._serialized,
                  });
                } else {
                  console.log(`    ⚠️  Could not extract KM: ${extraction.reason}`);
                }
              } catch (err) {
                console.log(`    ❌ Error processing message: ${err.message}`);
              }
            }
          }
        }

        console.log('\n' + '='.repeat(50));
        console.log('📊 METER READINGS SUMMARY');
        console.log('='.repeat(50));
        console.log(`Total images processed: ${readings.length}\n`);

        if (readings.length > 0) {
          readings.forEach((r, i) => {
            console.log(`${i + 1}. ${r.sender} — ${r.km} KM (${r.group})`);
          });
        }

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
      console.log('\n✅ Script completed');
      process.exit(0);
    })
    .catch(err => {
      console.error('Script failed:', err.message);
      process.exit(1);
    });
}

module.exports = { fetchMeterReadings };
