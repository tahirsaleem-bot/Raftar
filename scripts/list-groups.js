// Run this once to find your WhatsApp group IDs:
// node scripts/list-groups.js
//
// Then copy the IDs into src/config/hubGroups.js

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './credentials/whatsapp-session' }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] },
});

client.on('ready', async () => {
  console.log('\n=== WhatsApp Groups ===\n');
  const chats = await client.getChats();
  const groups = chats.filter(c => c.isGroup);

  if (groups.length === 0) {
    console.log('No groups found.');
  } else {
    groups.forEach(g => {
      console.log(`Name : ${g.name}`);
      console.log(`ID   : ${g.id._serialized}`);
      console.log('---');
    });
  }

  await client.destroy();
  process.exit(0);
});

client.on('qr', () => {
  console.log('QR scan required — run npm start first to establish session.');
  process.exit(1);
});

client.initialize();
