const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './credentials/whatsapp-session' }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('ready', async () => {
  console.log('✅ WhatsApp Ready!\n');

  try {
    const chats = await client.getChats();
    console.log(`📱 Total chats found: ${chats.length}\n`);

    const groups = chats.filter(c => c.isGroup);
    console.log(`📂 Total groups: ${groups.length}\n`);

    console.log('🔍 Groups list:');
    groups.forEach((g, i) => {
      console.log(`${i+1}. ${g.name}`);
      console.log(`   ID: ${g.id._serialized}`);
    });

    console.log('\n✅ Done');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
});

client.on('disconnected', () => {
  console.log('Disconnected');
  process.exit(1);
});

console.log('🔄 Connecting...');
client.initialize();

setTimeout(() => {
  console.log('⏱️ Timeout');
  process.exit(1);
}, 45000);
