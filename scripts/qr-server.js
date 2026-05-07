const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
let latestQR = null;
let clientReady = false;

// Initialize WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './credentials/whatsapp-session' }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', async (qr) => {
  console.log('📱 QR Code generated!');
  latestQR = qr;
  
  // Save as PNG
  try {
    await QRCode.toFile('./assets/current-qr.png', qr, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 500,
      margin: 2
    });
    console.log('✅ Saved: assets/current-qr.png');
  } catch (e) {
    console.log('QR save error:', e.message);
  }
});

client.on('authenticated', () => {
  console.log('✅ WhatsApp Authenticated!');
});

client.on('ready', () => {
  console.log('✅ WhatsApp Ready!');
  clientReady = true;
});

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WhatsApp QR - Raftar</title>
  <style>
    body { margin: 0; padding: 0; display: flex; align-items: center; justify-content: center;
           height: 100vh; background: linear-gradient(135deg, #0d1117 0%, #161b22 100%);
           font-family: Arial, sans-serif; color: #fff; }
    .container { text-align: center; }
    h1 { color: #25d366; font-size: 2rem; margin-bottom: 10px; }
    .subtitle { color: #888; margin-bottom: 30px; }
    .qr-box { background: white; padding: 20px; border-radius: 10px; display: inline-block; }
    img { width: 400px; height: 400px; }
    .steps { margin-top: 30px; color: #aaa; font-size: 14px; line-height: 1.8; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📱 WhatsApp Link Device</h1>
    <p class="subtitle">Apne phone se QR code scan karo</p>
    <div class="qr-box">
      <img src="/qr-image" alt="WhatsApp QR Code">
    </div>
    <div class="steps">
      <strong>Steps:</strong><br>
      1. Phone par WhatsApp open karo<br>
      2. Menu (3 dots) → Linked Devices<br>
      3. "Link a Device" click karo<br>
      4. Is QR code ko camera se point karo<br>
      5. Scan ho jayega automatically ✅
    </div>
  </div>
</body>
</html>`);
});

app.get('/qr-image', (req, res) => {
  res.sendFile(path.resolve('./assets/current-qr.png'));
});

app.get('/list-groups', async (req, res) => {
  try {
    if (!clientReady) {
      return res.json({ success: false, error: 'WhatsApp not ready yet' });
    }

    const chats = await client.getChats();
    const groups = chats.filter(c => c.isGroup).map(g => ({
      name: g.name,
      id: g.id._serialized,
      unreadCount: g.unreadCount
    }));

    res.json({ success: true, totalChats: chats.length, totalGroups: groups.length, groups });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/fetch-readings', async (req, res) => {
  try {
    if (!clientReady) {
      return res.json({ success: false, error: 'WhatsApp not ready yet, try again in 10 seconds' });
    }

    const { HUB_GROUPS } = require('../src/config/hubGroups');
    const { extractKMFromImage } = require('../src/vision/extractKM');

    const TODAY = new Date().toISOString().split('T')[0];
    const results = [];
    console.log(`📊 Fetching readings for ${TODAY}...`);

    for (const hub of HUB_GROUPS) {
      try {
        console.log(`  📌 Checking ${hub.hubName}...`);
        const chat = await client.getChatById(hub.groupId);
        if (!chat) {
          console.log(`    ❌ Chat not found`);
          continue;
        }
        console.log(`    ✅ Chat found`);

        const messages = await chat.fetchMessages({ limit: 100 });
        const todayImages = messages.filter(msg => {
          const msgDate = new Date(msg.timestamp * 1000).toISOString().split('T')[0];
          return msgDate === TODAY && msg.type === 'image';
        });

        for (const msg of todayImages) {
          try {
            const contact = await msg.getContact();
            const senderName = contact.pushname || contact.name || msg.from;
            const media = await msg.downloadMedia();
            if (!media) continue;

            const imageBuffer = Buffer.from(media.data, 'base64');
            const extraction = await extractKMFromImage(imageBuffer, senderName);
            if (!extraction.success) continue;

            results.push({
              hub: hub.hubName,
              sender: senderName,
              km: extraction.km,
              timestamp: new Date(msg.timestamp * 1000).toISOString()
            });
          } catch (err) {
            console.log('Error:', err.message);
          }
        }
      } catch (err) {
        console.log('Group error:', err.message);
      }
    }

    res.json({ success: true, date: TODAY, readings: results });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.listen(4000, () => {
  console.log('QR Server on port 4000');
  client.initialize();
});

setTimeout(() => {
  console.log('Still initializing... keeping alive');
}, 120000);
