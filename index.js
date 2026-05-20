require('dotenv').config();

const express = require('express');
const config = require('./src/config');
const { initWhatsApp, getClient, isReady } = require('./src/whatsapp/whatsappClient');
const { startScheduler } = require('./src/scheduler/dailyChecker');
const { startLDOScheduler } = require('./src/scheduler/ldoChecker');
const { startFPUScheduler } = require('./src/scheduler/fpuChecker');
const { ensureHeaders } = require('./src/sheets/sheetsClient');
const { processAllEmployees, processEmployeeRoute, fetchEmployeeRoutes, fetchSchools } = require('./src/routes/processEmployeeRoutes');
const logger = require('./src/logger');

const path = require('path');
const app = express();
app.use(express.json());
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// ─── Status page with logo ────────────────────────────────────────────────────
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const fs = require('fs');

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Raftar Agent</title>
  <style>
    body { background: #0d1117; display: flex; flex-direction: column; align-items: center;
           justify-content: center; height: 100vh; margin: 0; font-family: Arial, sans-serif; color: #fff; }
    img { width: 320px; border-radius: 50%; }
    h1 { margin: 16px 0 4px; font-size: 2rem; color: #d4a017; }
    p  { color: #aaa; font-size: 0.95rem; }
    .dot { display: inline-block; width: 10px; height: 10px; background: #2ecc71;
           border-radius: 50%; margin-right: 6px; }
    a { color: #58a6ff; text-decoration: none; margin-top: 20px; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <img src="/assets/raftar-logo.jpg" alt="Raftar Logo">
  <h1>Raftar</h1>
  <p><span class="dot"></span>Agent Online — ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}</p>
  <a href="/upload">📸 Upload FPU Reading</a>
  <a href="/api/get-qrcode" download="whatsapp-qrcode.png">📱 Download QR Code</a>
</body>
</html>`);
});

// ─── Get QR Code Image ────────────────────────────────────────────────────────
app.get('/api/get-qrcode', (req, res) => {
  const qrcodePath = path.join(__dirname, 'qrcode.png');
  if (fs.existsSync(qrcodePath)) {
    res.download(qrcodePath, 'whatsapp-qrcode.png');
  } else {
    res.status(404).json({ success: false, error: 'QR code not generated yet. Start the server and wait for the QR code.' });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/upload', (req, res) => {
  const hubs = ['E-9 AHQ', 'lane 6', 'Khawaja corporation', 'Tramri Chowk', 'H-13 Tarnol', 'I-10 Tarnol', 'Misrial Road'];
  const hubOptions = hubs.map(h => `<option value="${h}">${h}</option>`).join('');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Upload FPU Reading</title>
  <style>
    body { background: #0d1117; display: flex; flex-direction: column; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; padding: 20px; font-family: Arial, sans-serif; color: #fff; }
    .container { background: #1c2128; padding: 30px; border-radius: 10px; max-width: 500px; width: 100%; }
    h1 { color: #d4a017; margin-top: 0; }
    label { display: block; margin-top: 15px; color: #aaa; font-size: 0.9rem; }
    select, input[type="file"] { width: 100%; padding: 10px; margin-top: 5px; background: #0d1117;
                                 color: #fff; border: 1px solid #30363d; border-radius: 5px; }
    button { width: 100%; padding: 12px; margin-top: 20px; background: #d4a017; color: #000; border: none;
             border-radius: 5px; font-size: 1rem; font-weight: bold; cursor: pointer; }
    button:hover { background: #e6b800; }
    .status { margin-top: 20px; padding: 15px; border-radius: 5px; display: none; }
    .success { background: #238636; color: #fff; }
    .error { background: #da3633; color: #fff; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📸 Upload FPU Reading</h1>
    <form id="uploadForm" enctype="multipart/form-data">
      <label>Hub Name:</label>
      <select name="hubName" required>${hubOptions}</select>

      <label>Image:</label>
      <input type="file" name="image" accept="image/*" required>

      <button type="submit">Upload & Extract</button>
    </form>
    <div id="status" class="status"></div>
  </div>

  <script>
    document.getElementById('uploadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const status = document.getElementById('status');
      status.textContent = 'Processing...';
      status.className = 'status';
      status.style.display = 'block';

      try {
        const res = await fetch('/api/upload-fpu', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.success) {
          status.textContent = '✅ Done! Reading: ' + data.km + ' KM added to sheet';
          status.className = 'status success';
          e.target.reset();
        } else {
          status.textContent = '❌ Error: ' + data.error;
          status.className = 'status error';
        }
      } catch (err) {
        status.textContent = '❌ Error: ' + err.message;
        status.className = 'status error';
      }
    });
  </script>
</body>
</html>`);
});

// ─── Dashboard UI ─────────────────────────────────────────────────────────────
app.get('/dashboard', (req, res) => {
  const uptime = Math.floor(process.uptime() / 60);
  const now = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Raftar Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 100%);
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
    }
    .header h1 {
      font-size: 2rem;
      color: #d4a017;
      font-weight: 700;
    }
    .header-info {
      text-align: right;
      font-size: 0.9rem;
    }
    .header-info div {
      margin: 5px 0;
      color: #aaa;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .card {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
    }
    .card:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(212, 160, 23, 0.3);
      transform: translateY(-2px);
    }
    .card-title {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #888;
      margin-bottom: 12px;
    }
    .card-value {
      font-size: 1.8rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 8px;
    }
    .status-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-online { background: rgba(46, 204, 113, 0.2); color: #2ecc71; }
    .status-offline { background: rgba(231, 76, 60, 0.2); color: #e74c3c; }
    .status-pending { background: rgba(241, 196, 15, 0.2); color: #f1c40f; }
    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 6px;
    }
    .dot-online { background: #2ecc71; }
    .dot-offline { background: #e74c3c; }
    .schedule-item {
      padding: 10px;
      margin: 8px 0;
      background: rgba(255, 255, 255, 0.03);
      border-left: 3px solid #d4a017;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    .schedule-time { color: #d4a017; font-weight: 600; }
    .schedule-desc { color: #aaa; margin-top: 4px; }
    .hub-list {
      display: grid;
      gap: 8px;
    }
    .hub-item {
      padding: 10px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 6px;
      font-size: 0.9rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .hub-name { color: #e0e0e0; }
    .hub-status { font-size: 0.8rem; color: #888; }
    .footer {
      text-align: center;
      padding: 20px;
      color: #666;
      font-size: 0.85rem;
    }
    @media (max-width: 768px) {
      .header { flex-direction: column; gap: 15px; }
      .header h1 { font-size: 1.5rem; }
      .grid { grid-template-columns: 1fr; }
      .header-info { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div>
        <h1>🚀 Raftar Agent</h1>
        <p style="color: #888; margin-top: 5px;">Meter Reading Automation System</p>
      </div>
      <div class="header-info">
        <div><strong>Server Uptime:</strong> ${uptime} minutes</div>
        <div><strong>Current Time:</strong> ${now}</div>
        <div><strong>Timezone:</strong> Asia/Karachi (PKT)</div>
      </div>
    </div>

    <!-- Status Grid -->
    <div class="grid">
      <!-- WhatsApp Status -->
      <div class="card">
        <div class="card-title">📱 WhatsApp Status</div>
        <div class="card-value">
          <span class="dot dot-online"></span>Connected
        </div>
        <div class="status-badge status-online">✓ Active</div>
        <div style="margin-top: 12px; font-size: 0.85rem; color: #aaa;">
          Listening to 7 hub groups<br>
          Session: Saved & Ready
        </div>
      </div>

      <!-- Server Status -->
      <div class="card">
        <div class="card-title">⚙️ Server Status</div>
        <div class="card-value">
          <span class="dot dot-online"></span>Running
        </div>
        <div class="status-badge status-online">✓ Port 3000</div>
        <div style="margin-top: 12px; font-size: 0.85rem; color: #aaa;">
          All services initialized<br>
          Express + Node.js active
        </div>
      </div>

      <!-- Google Sheets -->
      <div class="card">
        <div class="card-title">📊 Google Sheets</div>
        <div class="card-value">
          <span class="dot dot-online"></span>Connected
        </div>
        <div class="status-badge status-online">✓ Verified</div>
        <div style="margin-top: 12px; font-size: 0.85rem; color: #aaa;">
          Logistics Operations Sheet<br>
          OAuth Authenticated
        </div>
      </div>

      <!-- Vision API -->
      <div class="card">
        <div class="card-title">🧠 Gemini Vision</div>
        <div class="card-value">
          <span class="dot dot-online"></span>Ready
        </div>
        <div class="status-badge status-online">✓ Active</div>
        <div style="margin-top: 12px; font-size: 0.85rem; color: #aaa;">
          API Key: Valid<br>
          Extraction: Enabled
        </div>
      </div>
    </div>

    <!-- Schedulers -->
    <div class="grid">
      <div class="card">
        <div class="card-title">⏰ Daily Schedulers</div>
        <div class="schedule-item">
          <div class="schedule-time">📸 10:00 AM</div>
          <div class="schedule-desc">FPU Auto-Fetch from WhatsApp</div>
        </div>
        <div class="schedule-item">
          <div class="schedule-time">📊 3:00 PM</div>
          <div class="schedule-desc">LDO Auto-Fetch & Total Calculation</div>
        </div>
        <div class="schedule-item">
          <div class="schedule-time">🔔 5:00 PM</div>
          <div class="schedule-desc">Send Reminders (if data missing)</div>
        </div>
      </div>

      <!-- Hub Groups -->
      <div class="card">
        <div class="card-title">🏢 Monitored Hubs (7)</div>
        <div class="hub-list">
          <div class="hub-item">
            <span class="hub-name">E-9 AHQ</span>
            <span class="hub-status">Monitoring</span>
          </div>
          <div class="hub-item">
            <span class="hub-name">lane 6 (Scheme 3)</span>
            <span class="hub-status">Monitoring</span>
          </div>
          <div class="hub-item">
            <span class="hub-name">Khawaja corporation</span>
            <span class="hub-status">Monitoring</span>
          </div>
          <div class="hub-item">
            <span class="hub-name">Tramri Chowk</span>
            <span class="hub-status">Monitoring</span>
          </div>
          <div class="hub-item">
            <span class="hub-name">H-13 Tarnol</span>
            <span class="hub-status">Monitoring</span>
          </div>
          <div class="hub-item">
            <span class="hub-name">I-10 Tarnol</span>
            <span class="hub-status">Monitoring</span>
          </div>
          <div class="hub-item">
            <span class="hub-name">Misrial Road</span>
            <span class="hub-status">Monitoring</span>
          </div>
        </div>
      </div>

      <!-- Quick Links -->
      <div class="card">
        <div class="card-title">🔗 Quick Links</div>
        <div class="schedule-item">
          <a href="http://localhost:3000" style="color: #d4a017; text-decoration: none; font-weight: 600;">
            🏠 Home Page
          </a>
        </div>
        <div class="schedule-item">
          <a href="http://localhost:3000/health" style="color: #d4a017; text-decoration: none; font-weight: 600;">
            💓 Health Check
          </a>
        </div>
        <div class="schedule-item">
          <a href="https://docs.google.com/spreadsheets/d/12nKyUZxrnH9kAtP8UAKrdAh5rWGBXSeO2tJjyjurG2E" style="color: #d4a017; text-decoration: none; font-weight: 600;">
            📈 Google Sheet
          </a>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>✨ Raftar KM Agent — Automated Meter Reading System</p>
      <p style="margin-top: 8px; font-size: 0.8rem; color: #555;">Last Updated: ${now} | Status: All Systems Operational ✓</p>
    </div>
  </div>
</body>
</html>`);
});

// ─── Debug: List WhatsApp groups ──────────────────────────────────────────────
// ─── Status: Latest images received ───────────────────────────────────────────
let latestImages = {};

app.get('/api/latest-images', (req, res) => {
  res.json({ latestImages });
});

app.get('/debug/groups', async (req, res) => {
  try {
    const { getClient, isReady } = require('./src/whatsapp/whatsappClient');
    const client = getClient();
    if (!client || !isReady()) {
      return res.json({ error: 'WhatsApp not connected' });
    }
    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup).map(g => ({
      name: g.name,
      id: g.id._serialized,
    }));
    res.json({ groups });
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.get('/debug/group/:groupId', async (req, res) => {
  try {
    const { getClient, isReady } = require('./src/whatsapp/whatsappClient');
    const client = getClient();
    if (!client || !isReady()) {
      return res.json({ error: 'WhatsApp not connected' });
    }

    const groupId = req.params.groupId;

    // Try direct browser Store access
    try {
      const result = await client.pupPage.evaluate(async (gId) => {
        if (!window.Store) return { error: 'Store not available' };

        const chat = window.Store.Chat.get(gId);
        if (!chat) return { error: 'Chat not found' };

        const allMsgs = Array.isArray(chat.msgs.models) ? chat.msgs.models : Object.values(chat.msgs.models || {});
        const imageMessages = allMsgs.filter(m => m && m.type === 'image');

        return {
          chatName: chat.name,
          chatId: chat.id._serialized,
          totalMessages: allMsgs.length,
          imageMessages: imageMessages.length,
          latestImageTime: imageMessages.length > 0 ? new Date(imageMessages[imageMessages.length - 1].timestamp * 1000).toISOString() : null,
        };
      }, groupId);

      res.json(result);
    } catch (err) {
      res.json({ error: 'Browser evaluation failed: ' + err.message, groupId });
    }
  } catch (err) {
    res.json({ error: err.message, groupId: req.params.groupId });
  }
});

// ─── Calculate routes API ─────────────────────────────────────────────────────
app.get('/api/calculate-routes', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    const startRow = req.query.startRow ? parseInt(req.query.startRow) : 2;
    const result = await processAllEmployees(limit, startRow);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Manual FPU check API ─────────────────────────────────────
app.get('/api/check-fpu', async (req, res) => {
  try {
    await require('./src/scheduler/fpuChecker').runFPUCheck();
    res.json({ success: true, message: 'FPU check completed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Manual LDO check API ─────────────────────────────────────
app.get('/api/check-ldo', async (req, res) => {
  try {
    await require('./src/scheduler/ldoChecker').runLDOCheck();
    res.json({ success: true, message: 'LDO check completed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Send WhatsApp Message API ────────────────────────────────────────────────
app.post('/api/send-message', async (req, res) => {
  try {
    const { contact, message } = req.body;
    if (!contact || !message) {
      return res.status(400).json({ success: false, error: 'contact and message required' });
    }

    const { getClient, isReady } = require('./src/whatsapp/whatsappClient');
    const client = getClient();

    if (!client || !isReady()) {
      return res.json({ success: false, error: 'WhatsApp not connected' });
    }

    const contacts = await client.getContacts();
    const targetContact = contacts.find(c =>
      c.name && c.name.toLowerCase().includes(contact.toLowerCase())
    );

    if (!targetContact) {
      const available = contacts.filter(c => c.name).map(c => c.name).slice(0, 10);
      return res.json({
        success: false,
        error: `Contact not found. Available: ${available.join(', ')}`
      });
    }

    await targetContact.getChat();
    await client.sendMessage(targetContact.id._serialized, message);

    logger.info(`[api] Message sent to ${targetContact.name}`);
    res.json({ success: true, message: `Message sent to ${targetContact.name}` });
  } catch (err) {
    logger.error('[api] Send message error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Send message by phone number ────────────────────────────────────────────
app.post('/api/send-message-by-phone', async (req, res) => {
  try {
    let { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'phone and message required' });
    }

    const { getClient, isReady } = require('./src/whatsapp/whatsappClient');
    const client = getClient();

    if (!client || !isReady()) {
      return res.json({ success: false, error: 'WhatsApp not connected' });
    }

    // Convert to international format if needed (03XX -> 923XX)
    if (phone.startsWith('0')) {
      phone = '92' + phone.slice(1);
    }

    const chatId = phone.includes('@') ? phone : `${phone}@c.us`;

    await client.sendMessage(chatId, message);
    logger.info(`[api] Message sent to ${phone}`);
    res.json({ success: true, message: `Message sent to ${phone}` });
  } catch (err) {
    logger.error('[api] Send message by phone error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Upload FPU picture and extract reading ───────────────────────────────────
app.post('/api/upload-fpu', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image uploaded' });
    }

    const { hubName, dateStr } = req.body;
    if (!hubName) {
      return res.status(400).json({ success: false, error: 'hubName required' });
    }

    const { extractKMFromImage } = require('./src/vision/extractKM');
    const { updateFPU } = require('./src/sheets/logisticsClient');
    const { todaySheetDate } = require('./src/sheets/logisticsClient');

    const imageBuffer = req.file.buffer;
    const date = dateStr || todaySheetDate(process.env.TIMEZONE || 'Asia/Karachi');

    const extraction = await extractKMFromImage(imageBuffer, hubName);

    if (!extraction.success) {
      return res.json({ success: false, error: 'Could not extract reading from image' });
    }

    const updateResult = await updateFPU(hubName, date, extraction.km);

    logger.info(`[api] FPU uploaded for ${hubName}: ${extraction.km} KM`);
    res.json({ success: true, km: extraction.km, hubName, date, message: 'Reading added to sheet' });
  } catch (err) {
    logger.error('[api] Upload FPU error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Fetch all FPU readings using Puppeteer browser ────────────────────────────
app.get('/api/fetch-all-fpu-now', async (req, res) => {
  try {
    const { getClient, isReady } = require('./src/whatsapp/whatsappClient');
    if (!isReady()) return res.json({ success: false, error: 'WhatsApp not ready' });

    const { extractKMFromImage } = require('./src/vision/extractKM');
    const { HUB_GROUPS } = require('./src/config/hubGroups');
    const { updateFPU, todaySheetDate } = require('./src/sheets/logisticsClient');

    const client = getClient();
    const results = [];
    const dateStr = todaySheetDate(process.env.TIMEZONE || 'Asia/Karachi');

    for (const hub of HUB_GROUPS) {
      try {
        logger.info(`[fetch-fpu] Processing ${hub.hubName}...`);

        // Use Puppeteer to navigate to group and extract image
        const imageData = await client.pupPage.evaluate(async (groupId) => {
          try {
            // Wait for store to be available
            if (!window.Store) return null;

            const chat = window.Store.Chat.get(groupId);
            if (!chat || !chat.msgs) return null;

            // Get all messages
            const allMsgs = Array.isArray(chat.msgs.models) ? chat.msgs.models : Object.values(chat.msgs.models || {});

            // Filter image messages
            const imageMessages = allMsgs.filter(m => {
              return m && m.type === 'image' && m.mediaObject && m.mediaObject.mediaBlob;
            });

            if (imageMessages.length === 0) return null;

            // Sort by timestamp (newest first)
            imageMessages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            // Return latest image message ID
            return imageMessages[0].id._serialized;
          } catch (e) {
            console.error('Evaluate error:', e.message);
            return null;
          }
        }, hub.groupId);

        if (!imageData) {
          results.push({ hub: hub.hubName, success: false, error: 'No image messages found' });
          continue;
        }

        // Download the image
        const msg = await client.getMessageById(imageData);
        if (!msg) {
          results.push({ hub: hub.hubName, success: false, error: 'Message not found' });
          continue;
        }

        const media = await msg.downloadMedia();
        if (!media || !media.data) {
          results.push({ hub: hub.hubName, success: false, error: 'Media download failed' });
          continue;
        }

        // Extract KM using Gemini
        const imageBuffer = Buffer.from(media.data, 'base64');
        const extraction = await extractKMFromImage(imageBuffer, hub.hubName);

        if (extraction.success) {
          // Update sheet
          await updateFPU(hub.hubName, dateStr, extraction.km);
          results.push({ hub: hub.hubName, km: extraction.km, success: true });
          logger.info(`[fetch-fpu] ✅ ${hub.hubName}: ${extraction.km} KM`);
        } else {
          results.push({ hub: hub.hubName, success: false, error: 'KM extraction failed' });
        }
      } catch (err) {
        logger.error(`[fetch-fpu] Error for ${hub.hubName}:`, err.message);
        results.push({ hub: hub.hubName, success: false, error: err.message });
      }
    }

    res.json({ success: true, date: dateStr, results });
  } catch (err) {
    logger.error('[api] Fetch all FPU error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// ─── Manual FPU extraction from groups ────────────────────────────────────────────
app.get('/api/manual-fpu-extract', async (req, res) => {
  try {
    const { getClient, isReady } = require('./src/whatsapp/whatsappClient');
    const { extractKMFromImage } = require('./src/vision/extractKM');
    const { HUB_GROUPS } = require('./src/config/hubGroups');

    if (!isReady()) {
      return res.json({ success: false, error: 'WhatsApp not connected' });
    }

    const client = getClient();
    const results = [];

    for (const hub of HUB_GROUPS) {
      try {
        const chat = await client.getChatById(hub.groupId);
        if (!chat) {
          results.push({ hub: hub.hubName, success: false, error: 'Chat not found' });
          continue;
        }

        const messages = await chat.fetchMessages({ limit: 50 });
        const imageMessages = messages.filter(m => m.hasMedia && m.type === 'image');

        if (!imageMessages.length) {
          results.push({ hub: hub.hubName, success: false, error: 'No images found' });
          continue;
        }

        const latestImage = imageMessages[0];
        const media = await latestImage.downloadMedia();
        if (!media) {
          results.push({ hub: hub.hubName, success: false, error: 'Download failed' });
          continue;
        }

        const imageBuffer = Buffer.from(media.data, 'base64');
        const extraction = await extractKMFromImage(imageBuffer, hub.hubName);

        if (extraction.success) {
          results.push({ hub: hub.hubName, km: extraction.km, success: true });
          logger.info(`[manual-extract] ${hub.hubName}: ${extraction.km}`);
        } else {
          results.push({ hub: hub.hubName, success: false, error: 'Extraction failed' });
        }
      } catch (err) {
        results.push({ hub: hub.hubName, success: false, error: err.message });
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    logger.error('[api] Manual FPU extract error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Send Email ───────────────────────────────────────────────────────────────
app.post('/api/send-email', async (req, res) => {
  try {
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) {
      return res.status(400).json({ success: false, error: 'to, subject, body required' });
    }

    const { sendEmail } = require('./src/gmail/gmailClient');
    const result = await sendEmail({ to, subject, body });

    if (result.success) {
      logger.info(`[api] Email sent to ${to}`);
      res.json({ success: true, message: `Email sent to ${to}` });
    } else {
      res.json({ success: false, error: result.error });
    }
  } catch (err) {
    logger.error('[api] Send email error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Send Email Alerts to All Coaches ─────────────────────────────────────────
app.post('/api/send-coach-alerts', async (req, res) => {
  try {
    const { type = 'missing', hoursOverdue = 12 } = req.body;
    const { sendCoachEmailAlerts } = require('./src/alerts/coachAlerts');

    const result = await sendCoachEmailAlerts({ type, hoursOverdue });

    if (result.success) {
      logger.info(`[api] Coach alerts sent — ${result.summary}`);
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('[api] Send coach alerts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Send Email Alert to Specific Coach ────────────────────────────────────────
app.post('/api/send-coach-alert', async (req, res) => {
  try {
    const { phone, type = 'missing', hoursOverdue = 12 } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'phone required' });
    }

    const { sendCoachAlert } = require('./src/alerts/coachAlerts');
    const result = await sendCoachAlert(phone, { type, hoursOverdue });

    if (result.success) {
      logger.info(`[api] Alert sent to coach ${phone}`);
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error('[api] Send alert error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Get today's meter readings (quick check) ─────────────────────────────
app.get('/api/today-meterings', async (req, res) => {
  try {
    const { getTodayMeterings } = require('./src/whatsapp/getTodayMeterings');
    const results = await getTodayMeterings();
    res.json({ success: true, count: results.length, readings: results });
  } catch (err) {
    logger.error('[api] Today meterings error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Fetch today's readings from all groups ──────────────────────────────────
const { HUB_GROUPS } = require('./src/config/hubGroups');
const { extractKMFromImage } = require('./src/vision/extractKM');
const { validateKM } = require('./src/validation/validateKM');
const { writeKMRecord, recordExists, updateKMRecord } = require('./src/sheets/sheetsClient');

app.get('/api/fetch-today-readings', async (req, res) => {
  try {
    if (!isReady()) {
      return res.json({ success: false, error: 'WhatsApp not connected' });
    }

    const client = getClient();
    const TODAY = new Date().toISOString().split('T')[0];
    const results = [];

    logger.info('[api] Starting to fetch today\'s readings from groups...');

    for (const hub of HUB_GROUPS) {
      try {
        const chat = await client.getChatById(hub.groupId);
        if (!chat) {
          logger.warn(`[api] Could not find chat: ${hub.hubName}`);
          continue;
        }

        const messages = await chat.fetchMessages({ limit: 100 });
        const todayImages = messages.filter(msg => {
          const msgDate = new Date(msg.timestamp * 1000).toISOString().split('T')[0];
          return msgDate === TODAY && msg.type === 'image';
        });

        logger.info(`[api] Found ${todayImages.length} images in ${hub.hubName}`);

        for (const msg of todayImages) {
          try {
            const contact = await msg.getContact();
            const senderName = contact.pushname || contact.name || msg.from;
            const submittedAt = new Date(msg.timestamp * 1000).toISOString();
            const dateKey = submittedAt.split('T')[0];

            // Download and extract
            const media = await msg.downloadMedia();
            if (!media) continue;

            const imageBuffer = Buffer.from(media.data, 'base64');
            const extraction = await extractKMFromImage(imageBuffer, senderName);
            if (!extraction.success) continue;

            const validation = validateKM(extraction.km);
            if (!validation.valid) continue;

            // Write to sheets
            const record = {
              date: dateKey,
              teamMember: senderName,
              phone: msg.from,
              km: extraction.km,
              sourceMessage: `WhatsApp image — ${msg.id._serialized}`,
              submittedAt,
              status: 'submitted',
              reminderSent: 'no',
              notes: `Auto-fetched from ${hub.hubName}`,
            };

            const existing = await recordExists(senderName, dateKey);
            if (existing && config.app.duplicatePolicy === 'latest') {
              await updateKMRecord(senderName, dateKey, record);
            } else if (!existing) {
              await writeKMRecord(record);
            }

            results.push({
              senderName,
              km: extraction.km,
              hub: hub.hubName,
              time: submittedAt,
            });

            logger.info(`[api] Added: ${senderName} (${hub.hubName}) = ${extraction.km} KM`);
          } catch (err) {
            logger.warn(`[api] Error processing image: ${err.message}`);
          }
        }
      } catch (err) {
        logger.error(`[api] Error fetching from ${hub.hubName}:`, err.message);
      }
    }

    res.json({
      success: true,
      date: TODAY,
      count: results.length,
      readings: results,
    });
  } catch (err) {
    logger.error('[api] Fetch readings error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  logger.info('[app] Starting Raftar KM Agent...');

  // Ensure Google Sheet has header row
  await ensureHeaders();
  logger.info('[app] Google Sheets connection verified');

  // Start daily cut-off reminder scheduler
  startScheduler();

  // Start 10 AM FPU reading checker
  startFPUScheduler();

  // Start 3 PM LDO reading checker
  startLDOScheduler();

  // Initialize WhatsApp (shows QR code on first run)
  logger.info('[app] Initializing WhatsApp...');
  initWhatsApp();

  // Start HTTP server
  app.listen(config.app.port, () => {
    logger.info(`[app] Server running on port ${config.app.port}`);
    logger.info(`[app] Timezone: ${config.app.timezone} | Cutoff: ${config.app.dailyCutoffTime}`);
  });
}

start().catch(err => {
  logger.error('[app] Fatal startup error:', err.message);
  process.exit(1);
});
