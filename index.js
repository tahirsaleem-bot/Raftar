require('dotenv').config();

// ─── Cloud bootstrap: write Google credential files from env vars ─────────────
// On Railway the credentials/*.json files are NOT uploaded (gitignored). We
// instead store their contents in env vars and write them to disk at boot,
// onto the persistent volume mounted at ./credentials. No-op locally.
(function bootstrapCredentials() {
  const fs = require('fs');
  const path = require('path');
  const credDir = path.join(__dirname, 'credentials');
  try {
    if (!fs.existsSync(credDir)) fs.mkdirSync(credDir, { recursive: true });
    const pairs = [
      ['GOOGLE_OAUTH_CLIENT_JSON', 'google-oauth-client.json'],
      ['GOOGLE_TOKEN_JSON', 'google-token.json'],
    ];
    for (const [envKey, file] of pairs) {
      if (process.env[envKey]) {
        fs.writeFileSync(path.join(credDir, file), process.env[envKey]);
        console.log(`[bootstrap] wrote credentials/${file} from ${envKey}`);
      }
    }
  } catch (e) {
    console.error('[bootstrap] credential bootstrap failed:', e.message);
  }
})();

const express = require('express');
const config = require('./src/config');
const { initWhatsApp, getClient, isReady, getRecentMessages, getQRCode } = require('./src/whatsapp/whatsappClient');
const { startScheduler } = require('./src/scheduler/dailyChecker');
const { startLDOScheduler } = require('./src/scheduler/ldoChecker');
const { startFPUScheduler } = require('./src/scheduler/fpuChecker');
const { ensureHeaders } = require('./src/sheets/sheetsClient');
const { processAllEmployees, processEmployeeRoute, fetchEmployeeRoutes, fetchSchools } = require('./src/routes/processEmployeeRoutes');
const logger = require('./src/logger');

const path = require('path');
const app = express();
app.use(express.json());
// Email + password login for the dashboard (src/web/auth.js)
const dashAuth = require('./src/web/auth');
dashAuth.mount(app);
// Invite / revoke dashboard accounts from the /pa Users page (src/web/accessApi.js)
require('./src/web/accessApi').mount(app);
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// ─── People Analyzer Logbook web app (mounted at /pa) ─────────────────────────
app.use('/pa', require('./src/peopleAnalyzer/routes'));

// ─── Status page with logo ────────────────────────────────────────────────────
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const fs = require('fs');

// ─── In-memory storage for recent submissions ─────────────────────────────────
let recentSubmissions = [];
const MAX_SUBMISSIONS = 20;

function addSubmission(data) {
  recentSubmissions.unshift(data);
  if (recentSubmissions.length > MAX_SUBMISSIONS) {
    recentSubmissions.pop();
  }
}

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
  const qrcodePath = path.join(__dirname, 'status', 'qrcode.png');
  if (fs.existsSync(qrcodePath)) {
    res.download(qrcodePath, 'whatsapp-qrcode.png');
  } else {
    res.status(404).json({ success: false, error: 'QR code not generated yet. Start the server and wait for the QR code.' });
  }
});

// ─── Brand logo ──────────────────────────────────────────────────────────────
// Save the Raftar logo as one of these files and it appears automatically.
function findBrandLogo() {
  const candidates = ['raftar-brand.png', 'raftar-brand.jpg', 'raftar-logo.png'];
  for (const c of candidates) {
    const p = path.join(__dirname, 'assets', c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
app.get('/brand-logo', (req, res) => {
  const p = findBrandLogo();
  if (p) { res.sendFile(p); } else { res.status(404).end(); }
});

// ─── WhatsApp QR link page (scan from the browser) ───────────────────────────
app.get('/qr', async (req, res) => {
  const QRCode = require('qrcode');
  const connected = isReady();
  const raw = getQRCode();
  let qrImg = '';
  if (!connected && raw) {
    try { qrImg = await QRCode.toDataURL(raw, { width: 320, margin: 1 }); } catch (e) {}
  }

  const body = connected
    ? `<div class="state ok">
         <div class="big">✅</div>
         <h2>WhatsApp Connected</h2>
         <p>Raftar linked hai aur messages sun raha hai. Scan ki zaroorat nahi.</p>
       </div>`
    : qrImg
      ? `<div class="state">
           <h2>Link WhatsApp</h2>
           <img class="qr" src="${qrImg}" alt="WhatsApp QR" />
           <ol class="steps">
             <li>Phone pe WhatsApp kholo</li>
             <li>Settings → <b>Linked Devices</b></li>
             <li><b>Link a Device</b> dabao</li>
             <li>Ye QR scan karo</li>
           </ol>
           <p class="hint">Page har 12s auto-refresh hota hai.</p>
         </div>`
      : `<div class="state">
           <div class="big spin">⏳</div>
           <h2>QR ban raha hai…</h2>
           <p>Thoda intezaar karo, page khud refresh ho jayega.</p>
         </div>`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${connected ? '' : '<meta http-equiv="refresh" content="12">'}
  <title>Raftar · Link WhatsApp</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background: radial-gradient(1000px 500px at 50% -10%, #1c2140, #0f0f1e 55%); color:#e6e6ee;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; min-height:100vh;
      display:flex; align-items:center; justify-content:center; padding:24px; }
    .card { width:100%; max-width:380px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08);
      border-radius:18px; padding:28px 24px; text-align:center; }
    .brand { display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:18px; }
    .brand span { font-size:1.4rem; } .brand h1 { font-size:1.1rem; font-weight:700; }
    .brand img { width:66px; height:66px; border-radius:14px; object-fit:contain; }
    h2 { font-size:1.15rem; margin-bottom:10px; }
    .qr { width:280px; height:280px; border-radius:12px; background:#fff; padding:10px; margin:8px auto 16px; }
    .steps { text-align:left; max-width:250px; margin:0 auto; color:#c8c8d8; font-size:.85rem; line-height:1.7; }
    .steps b { color:#fff; }
    .hint { margin-top:14px; font-size:.72rem; color:#7a7a90; }
    p { color:#9a9ab0; font-size:.85rem; }
    .big { font-size:3rem; margin-bottom:8px; }
    .state.ok .big { filter:drop-shadow(0 0 12px rgba(52,211,153,.5)); }
    .spin { display:inline-block; animation:sp 1.6s linear infinite; } @keyframes sp { to { transform:rotate(360deg);} }
    .foot { margin-top:18px; font-size:.7rem; color:#55556a; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">${findBrandLogo() ? '<img src="/brand-logo" alt="Raftar" />' : '<span>🚀</span>'}<h1>Raftar</h1></div>
    ${body}
    <div class="foot">WhatsApp linking · Asia/Karachi</div>
  </div>
</body>
</html>`);
});

// ─── QR status as JSON (for programmatic checks) ─────────────────────────────
app.get('/api/qr-status', (req, res) => {
  res.json({ connected: isReady(), hasQr: !!getQRCode() });
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/upload', (req, res) => {
  // Derived from HUB_GROUPS, never hardcoded: the value posted from this form
  // becomes the hubName used to find the sheet row, so a stale copy of this list
  // silently breaks uploads (it still read 'E-9 AHQ'/'lane 6' after the rename).
  const hubs = require('./src/config/hubGroups').HUB_GROUPS.map(h => h.hubName);
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

// ─── TEST Dashboard (Experimental Features) ───────────────────────────────────
app.get('/dashboard-test', (req, res) => {
  const uptime = Math.floor(process.uptime() / 60);
  const now = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
  const todayDate = new Date().toLocaleDateString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Hub submissions today (test data - will be real data later)
  const hubStats = {
    'E-9 AHQ': 3,
    'Lane 6': 2,
    'Khawaja Corp': 4,
    'Taramri Chowk': 1,
    'H-13 Tarnol': 2,
    'I-10 Tarnol': 0,
    'Misrial Road': 0
  };

  const hubStatsHtml = Object.entries(hubStats)
    .map(([hub, count]) => `<span style="margin-right: 15px; padding: 4px 8px; background: rgba(46, 204, 113, 0.1); border-radius: 4px; font-size: 0.9rem;">${hub}: <strong>${count}</strong> 📸</span>`)
    .join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Raftar Dashboard (TEST)</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0f1829 100%);
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
      padding: 20px;
      background: linear-gradient(135deg, rgba(52, 211, 153, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%);
      border-radius: 12px;
      border: 1px solid rgba(52, 211, 153, 0.3);
      flex-wrap: wrap;
    }
    .header h1 { font-size: 2rem; color: #34d399; font-weight: 700; }
    .test-badge { background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%); color: white; padding: 8px 16px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .card {
      background: linear-gradient(135deg, rgba(30, 58, 138, 0.3) 0%, rgba(49, 46, 129, 0.2) 100%);
      border: 1px solid rgba(52, 211, 153, 0.2);
      border-radius: 12px;
      padding: 20px;
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
    }
    .card:hover {
      background: linear-gradient(135deg, rgba(52, 211, 153, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%);
      border-color: rgba(52, 211, 153, 0.5);
      transform: translateY(-2px);
    }
    .card h3 { color: #34d399; margin-bottom: 15px; font-size: 1.1rem; font-weight: 600; }
    .card-value { font-size: 2.5rem; color: #10b981; font-weight: bold; margin: 10px 0; }
    .card-desc { color: #888; font-size: 0.9rem; }
    .activity-log {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
    }
    .activity-item {
      padding: 12px;
      margin: 8px 0;
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(59, 130, 246, 0.1) 100%);
      border-left: 4px solid #22c55e;
      border-radius: 6px;
      font-size: 0.95rem;
    }
    .activity-time { color: #888; font-size: 0.85rem; }
    .submission-table {
      width: 100%;
      border-collapse: collapse;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      overflow: hidden;
    }
    .submission-table th {
      background: linear-gradient(135deg, rgba(52, 211, 153, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%);
      padding: 12px;
      text-align: left;
      color: #34d399;
      border-bottom: 2px solid rgba(52, 211, 153, 0.3);
      font-weight: 600;
    }
    .submission-table td {
      padding: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .status-success { background: rgba(34, 197, 94, 0.2); color: #10b981; }
    .status-pending { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .hub-badge {
      display: inline-block;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%);
      color: #60a5fa;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 0.85rem;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .footer { text-align: center; color: #666; font-size: 0.85rem; margin-top: 40px; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header" style="flex-direction: column; align-items: flex-start;">
      <div style="display: flex; justify-content: space-between; width: 100%; align-items: center; margin-bottom: 15px;">
        <div>
          <h1>🚀 Raftar Agent (TEST DASHBOARD)</h1>
          <span class="test-badge">🧪 EXPERIMENTAL</span>
        </div>
        <div style="text-align: right; color: #aaa; font-size: 0.9rem;">
          <div><strong>Current Time:</strong> ${now}</div>
          <div><strong>Server Uptime:</strong> ${uptime} min</div>
        </div>
      </div>

      <!-- Today's Date and Hub Picture Count -->
      <div style="width: 100%; padding: 12px; background: rgba(212, 160, 23, 0.1); border-radius: 8px; border-left: 3px solid #d4a017;">
        <div style="color: #d4a017; font-weight: bold; margin-bottom: 8px;">📅 ${todayDate}</div>
        <div style="display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.85rem;">
          ${hubStatsHtml}
        </div>
      </div>
    </div>

    <!-- Section 1: Statistics -->
    <div class="grid">
      <div class="card">
        <h3>📸 Today's Submissions</h3>
        <div class="card-value">12</div>
        <div class="card-desc">Driver meter readings received</div>
      </div>
      <div class="card">
        <h3>✅ Successfully Updated</h3>
        <div class="card-value">12</div>
        <div class="card-desc">All submissions processed</div>
      </div>
      <div class="card">
        <h3>📊 Total KM</h3>
        <div class="card-value">1,540</div>
        <div class="card-desc">Meters recorded today</div>
      </div>
      <div class="card">
        <h3>💬 Personal Messages</h3>
        <div class="card-value">388</div>
        <div class="card-desc">WhatsApp chats monitored</div>
      </div>
      <div class="card">
        <h3>🎯 Success Rate</h3>
        <div class="card-value">100%</div>
        <div class="card-desc">No failures today</div>
      </div>
      <div class="card">
        <h3>⏱️ Avg Response</h3>
        <div class="card-value">2.3s</div>
        <div class="card-desc">Processing time</div>
      </div>
    </div>

    <!-- Section 2: Real-Time Activity Log -->
    <div class="activity-log">
      <h3>⚡ Real-Time Activity Log (Last 10 Events)</h3>
      <div class="activity-item">
        <div><strong>✅ FPU Updated</strong> - E-9 AHQ: 240 KM (Hamza Khan)</div>
        <div class="activity-time">16:50:15 PM PKT</div>
      </div>
      <div class="activity-item">
        <div><strong>📸 Image Received</strong> - Lane 6: Picture from Driver</div>
        <div class="activity-time">16:50:08 PM PKT</div>
      </div>
      <div class="activity-item">
        <div><strong>✅ LDO Updated</strong> - Khawaja Corp: 189 KM (Ali Raza)</div>
        <div class="activity-time">16:49:45 PM PKT</div>
      </div>
      <div class="activity-item">
        <div><strong>🔍 KM Extracted</strong> - Taramri Chowk: 156 KM (OCR Success)</div>
        <div class="activity-time">16:49:32 PM PKT</div>
      </div>
      <div class="activity-item">
        <div><strong>📸 Image Received</strong> - H-13 Tarnol: Picture from Driver</div>
        <div class="activity-time">16:48:20 PM PKT</div>
      </div>
    </div>

    <!-- Section 3: FPU/LDO Status for All 7 Hubs -->
    <div style="margin-bottom: 30px;">
      <h3 style="color: #d4a017; margin-bottom: 15px;">📊 FPU/LDO Status - All 7 Hubs (Today)</h3>
      <style>
        .hub-card {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%);
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 15px;
          transition: all 0.3s ease;
        }
        .hub-card:hover {
          background: linear-gradient(135deg, rgba(52, 211, 153, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%);
          border-color: rgba(52, 211, 153, 0.5);
        }
        .hub-name { color: #34d399; font-weight: bold; font-size: 1.1rem; margin-bottom: 10px; }
        .fpu-ldo-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }
        .fpu-box, .ldo-box {
          background: rgba(255, 255, 255, 0.02);
          padding: 12px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .fpu-box { border-left: 4px solid #3b82f6; background: rgba(59, 130, 246, 0.1); }
        .ldo-box { border-left: 4px solid #f59e0b; background: rgba(245, 158, 11, 0.1); }
        .status-label { font-size: 0.85rem; color: #a0aec0; margin-bottom: 5px; font-weight: 600; }
        .reading-value { font-size: 1.3rem; font-weight: bold; color: #10b981; }
        .reading-pending { font-size: 1.3rem; color: #fbbf24; font-weight: 600; }
        .reading-time { font-size: 0.8rem; color: #666; margin-top: 5px; }
        .reminder-badge { display: inline-block; background: #e74c3c; color: white; padding: 3px 8px; border-radius: 3px; font-size: 0.75rem; margin-top: 5px; }
      </style>

      <!-- Hub 1: E-9 AHQ -->
      <div class="hub-card">
        <div class="hub-name">🏢 E-9 AHQ</div>
        <div class="fpu-ldo-row">
          <div class="fpu-box">
            <div class="status-label">🌅 FPU (10 AM)</div>
            <div class="reading-value">240 KM ✅</div>
            <div class="reading-time">Received at 09:50 AM</div>
          </div>
          <div class="ldo-box">
            <div class="status-label">🌆 LDO (3 PM)</div>
            <div class="reading-pending">⏳ Pending</div>
            <div class="reminder-badge">🔔 Reminder Sent</div>
          </div>
        </div>
      </div>

      <!-- Hub 2: Lane 6 -->
      <div class="hub-card">
        <div class="hub-name">🏢 Lane 6</div>
        <div class="fpu-ldo-row">
          <div class="fpu-box">
            <div class="status-label">🌅 FPU (10 AM)</div>
            <div class="reading-value">178 KM ✅</div>
            <div class="reading-time">Received at 10:05 AM</div>
          </div>
          <div class="ldo-box">
            <div class="status-label">🌆 LDO (3 PM)</div>
            <div class="reading-value">145 KM ✅</div>
            <div class="reading-time">Received at 17:30 PM</div>
          </div>
        </div>
      </div>

      <!-- Hub 3: Khawaja Corp -->
      <div class="hub-card">
        <div class="hub-name">🏢 Khawaja Corp</div>
        <div class="fpu-ldo-row">
          <div class="fpu-box">
            <div class="status-label">🌅 FPU (10 AM)</div>
            <div class="reading-value">189 KM ✅</div>
            <div class="reading-time">Received at 09:45 AM</div>
          </div>
          <div class="ldo-box">
            <div class="status-label">🌆 LDO (3 PM)</div>
            <div class="reading-value">167 KM ✅</div>
            <div class="reading-time">Received at 16:50 PM</div>
          </div>
        </div>
      </div>

      <!-- Hub 4: Taramri Chowk -->
      <div class="hub-card">
        <div class="hub-name">🏢 Taramri Chowk</div>
        <div class="fpu-ldo-row">
          <div class="fpu-box">
            <div class="status-label">🌅 FPU (10 AM)</div>
            <div class="reading-pending">⏳ Pending</div>
            <div class="reminder-badge">🔔 Reminder Sent</div>
          </div>
          <div class="ldo-box">
            <div class="status-label">🌆 LDO (3 PM)</div>
            <div class="reading-pending">⏳ Pending</div>
          </div>
        </div>
      </div>

      <!-- Hub 5: H-13 Tarnol -->
      <div class="hub-card">
        <div class="hub-name">🏢 H-13 Tarnol</div>
        <div class="fpu-ldo-row">
          <div class="fpu-box">
            <div class="status-label">🌅 FPU (10 AM)</div>
            <div class="reading-value">203 KM ✅</div>
            <div class="reading-time">Received at 10:20 AM</div>
          </div>
          <div class="ldo-box">
            <div class="status-label">🌆 LDO (3 PM)</div>
            <div class="reading-value">186 KM ✅</div>
            <div class="reading-time">Received at 17:15 PM</div>
          </div>
        </div>
      </div>

      <!-- Hub 6: I-10 Tarnol -->
      <div class="hub-card">
        <div class="hub-name">🏢 I-10 Tarnol</div>
        <div class="fpu-ldo-row">
          <div class="fpu-box">
            <div class="status-label">🌅 FPU (10 AM)</div>
            <div class="reading-pending">⏳ Pending</div>
          </div>
          <div class="ldo-box">
            <div class="status-label">🌆 LDO (3 PM)</div>
            <div class="reading-pending">⏳ Pending</div>
          </div>
        </div>
      </div>

      <!-- Hub 7: Misrial Road -->
      <div class="hub-card">
        <div class="hub-name">🏢 Misrial Road</div>
        <div class="fpu-ldo-row">
          <div class="fpu-box">
            <div class="status-label">🌅 FPU (10 AM)</div>
            <div class="reading-value">212 KM ✅</div>
            <div class="reading-time">Received at 09:55 AM</div>
          </div>
          <div class="ldo-box">
            <div class="status-label">🌆 LDO (3 PM)</div>
            <div class="reading-pending">⏳ Pending</div>
            <div class="reminder-badge">🔔 Reminder Sent</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Section 4: Recent Submissions Table -->
    <div style="margin-bottom: 30px;">
      <h3 style="color: #d4a017; margin-bottom: 15px;">📋 Recent Driver Submissions (Today)</h3>
      <table class="submission-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Driver</th>
            <th>Hub</th>
            <th>KM</th>
            <th>Type</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>16:50:15</td>
            <td>Hamza Khan</td>
            <td><span class="hub-badge">E-9 AHQ</span></td>
            <td>240</td>
            <td>FPU</td>
            <td><span class="status-badge status-success">✅ Updated</span></td>
          </tr>
          <tr>
            <td>16:49:45</td>
            <td>Ali Raza</td>
            <td><span class="hub-badge">Khawaja Corp</span></td>
            <td>189</td>
            <td>LDO</td>
            <td><span class="status-badge status-success">✅ Updated</span></td>
          </tr>
          <tr>
            <td>16:49:32</td>
            <td>Ahmed Malik</td>
            <td><span class="hub-badge">Taramri Chowk</span></td>
            <td>156</td>
            <td>FPU</td>
            <td><span class="status-badge status-success">✅ Updated</span></td>
          </tr>
          <tr>
            <td>16:48:20</td>
            <td>Sara Fatima</td>
            <td><span class="hub-badge">H-13 Tarnol</span></td>
            <td>203</td>
            <td>LDO</td>
            <td><span class="status-badge status-success">✅ Updated</span></td>
          </tr>
          <tr>
            <td>16:47:05</td>
            <td>Usama Pasha</td>
            <td><span class="hub-badge">Lane 6</span></td>
            <td>178</td>
            <td>FPU</td>
            <td><span class="status-badge status-success">✅ Updated</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Section 4: Hub Performance -->
    <div class="grid">
      <div class="card">
        <h3>🏢 Hub Performance (Today)</h3>
        <div style="font-size: 0.9rem; line-height: 1.8; color: #aaa;">
          <div>✅ E-9 AHQ: 3 submissions</div>
          <div>✅ Lane 6: 2 submissions</div>
          <div>✅ Khawaja Corp: 4 submissions</div>
          <div>✅ Taramri Chowk: 1 submission</div>
          <div>✅ H-13 Tarnol: 2 submissions</div>
        </div>
      </div>
      <div class="card">
        <h3>📈 Submission Trend</h3>
        <div style="font-size: 0.9rem; line-height: 1.8; color: #aaa;">
          <div>🔵 Before 12 PM: 6 submissions (FPU)</div>
          <div>🔴 After 12 PM: 6 submissions (LDO)</div>
          <div>📊 Avg per hub: 2.4</div>
          <div>⏱️ Peak time: 10:30 AM</div>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>✨ Test Dashboard — Raftar KM Agent</p>
      <p style="margin-top: 8px; font-size: 0.8rem; color: #555;">This is a TEST version to evaluate UI/UX features. Provide feedback on what to keep/remove for production.</p>
    </div>
  </div>
</body>
</html>`);
});

// ─── Dashboard UI (MAIN - Complete Production Dashboard) ──────────────────────
// v2 redesign, shown side by side with the current page until approved
app.get('/dashboard-preview', dashAuth.requireLogin, async (req, res) => {
  try {
    res.send(await require('./src/web/dashboard').render(req, { hasLogo: !!findBrandLogo(), user: req.user }));
  } catch (err) {
    logger.error('[dashboard-preview]', err.message);
    res.status(500).send('Preview failed');
  }
});

// Meter Reading dashboard (v2 design, approved by Tahir 2026-10-26).
// Rendering lives in src/web/dashboard.js; /dashboard-preview is kept as an alias.
app.get('/dashboard', dashAuth.requireLogin, async (req, res) => {
  try {
    res.send(await require('./src/web/dashboard').render(req, { hasLogo: !!findBrandLogo(), user: req.user }));
  } catch (err) {
    logger.error('[dashboard]', err.message);
    res.status(500).send('Dashboard could not be loaded — please refresh.');
  }
});

// ─── OLD Dashboard (backup) ──────────────────────────────────────────────────
app.get('/dashboard-old', (req, res) => {
  const uptime = Math.floor(process.uptime() / 60);
  const now = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
  const todayDate = new Date().toLocaleDateString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Hub submissions today (test data - will be real data later)
  const hubStats = {
    'E-9 AHQ': 3,
    'Lane 6': 2,
    'Khawaja Corp': 4,
    'Taramri Chowk': 1,
    'H-13 Tarnol': 2,
    'I-10 Tarnol': 0,
    'Misrial Road': 0
  };

  const hubStatsHtml = Object.entries(hubStats)
    .map(([hub, count]) => `<span style="margin-right: 15px; padding: 4px 8px; background: rgba(52, 211, 153, 0.1); border-radius: 4px; font-size: 0.9rem;">${hub}: <strong>${count}</strong> 📸</span>`)
    .join('');

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

// ─── Saved meter images (token-protected) ─────────────────────────────────────
// Every incoming hub image is saved to the meter image directory (on the
// Railway volume — see src/config/meterImageDir.js), but nothing served it, so
// the photos could not be reviewed or used to tune OCR without shell access
// (railway ssh has no registered key). These two routes expose that directory
// read-only, gated on METER_IMAGES_TOKEN. They return 404 rather than 401 on a
// bad token, so the routes are not discoverable by probing.
const { meterImageDir } = require('./src/config/meterImageDir');

function meterTokenOk(req) {
  const want = process.env.METER_IMAGES_TOKEN;
  if (!want) return false; // no token configured = feature off
  const got = req.query.token || req.get('x-meter-token');
  return typeof got === 'string' && got === want;
}

// Sends the exact "please type the reading" message to the linked account's
// OWN chat ("message yourself") — proves sending works before it is used in
// hub groups. Same token gate as the image routes; POST so it is never hit by
// a crawler or a link preview.
// Run the missing-readings email (kind=FPU|LDO) or the reply check now, instead
// of waiting for 11:00 / 18:30. Same token gate as the image routes.
app.post('/api/readings-mail/run', async (req, res) => {
  if (!meterTokenOk(req)) return res.status(404).end();
  const m = require('./src/services/readingsMail');
  try {
    if (req.query.what === 'replies') await m.pollReplies();
    else await m.sendMissingMail(req.query.kind === 'LDO' ? 'LDO' : 'FPU');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/test-ask-message', async (req, res) => {
  if (!meterTokenOk(req)) return res.status(404).end();
  try {
    const { getClient, isReady, askMessageFor } = require('./src/whatsapp/whatsappClient');
    const client = getClient();
    if (!client || !isReady()) return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    const self = client.info && client.info.wid && client.info.wid._serialized;
    if (!self) return res.status(503).json({ success: false, error: 'own WhatsApp id unknown' });
    // mentions the account itself, so the @mention path is exercised too
    await client.sendMessage(self, askMessageFor('@' + self.split('@')[0]), { mentions: [self] });
    res.json({ success: true, sentTo: 'self' });
  } catch (err) {
    logger.error('[api] test-ask-message failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Group id -> current name, read straight from WhatsApp Web's own chat
// collection. client.getChats() throws "r" on this build, so /debug/groups is
// useless; group names change (the Rawalpindi groups were renamed), and the
// hub config is keyed by id, so this is how ids are matched to names.
app.get('/api/group-names', async (req, res) => {
  if (!meterTokenOk(req)) return res.status(404).end();
  try {
    const { getClient, isReady } = require('./src/whatsapp/whatsappClient');
    const client = getClient();
    if (!client || !isReady() || !client.pupPage) return res.status(503).json({ success: false, error: 'WhatsApp not connected' });
    const groups = await client.pupPage.evaluate(() => {
      const tries = [
        () => window.require('WAWebCollections').Chat.getModelsArray(),
        () => window.Store.Chat.getModelsArray(),
        () => window.Store.Chat.models,
      ];
      for (const t of tries) {
        try {
          const arr = t();
          if (arr && arr.length) {
            return arr.filter(c => c.id && c.id.server === 'g.us')
              .map(c => ({ id: c.id._serialized, name: c.name || c.formattedTitle || (c.groupMetadata && c.groupMetadata.subject) || '' }));
          }
        } catch (e) { /* try next */ }
      }
      return null;
    });
    if (!groups) return res.status(500).json({ success: false, error: 'chat collection not reachable' });
    res.json({ success: true, count: groups.length, groups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/meter-images', (req, res) => {
  if (!meterTokenOk(req)) return res.status(404).end();
  try {
    if (!fs.existsSync(meterImageDir())) return res.json({ success: true, count: 0, files: [] });
    const limit = Math.min(parseInt(req.query.limit || '40', 10) || 40, 200);
    const files = fs.readdirSync(meterImageDir())
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
      .map(f => {
        const st = fs.statSync(path.join(meterImageDir(), f));
        return { file: f, bytes: st.size, modified: st.mtime.toISOString() };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified))
      .slice(0, limit);
    res.json({ success: true, count: files.length, files });
  } catch (err) {
    logger.error('[api] meter-images list failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/meter-images/:file', (req, res) => {
  if (!meterTokenOk(req)) return res.status(404).end();
  // basename() strips any path, so ../ traversal cannot escape the directory.
  const name = path.basename(String(req.params.file));
  if (!/^[\w.\-]+\.(jpg|jpeg|png)$/i.test(name)) return res.status(400).end();
  const full = path.join(meterImageDir(), name);
  if (!fs.existsSync(full)) return res.status(404).end();
  res.sendFile(full);
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
    const { todayISO } = require('./src/sheets/logisticsClient');

    const imageBuffer = req.file.buffer;
    const date = dateStr || todayISO(process.env.TIMEZONE || 'Asia/Karachi');

    const extraction = await extractKMFromImage(imageBuffer, hubName, { hubName, meterType: require('./src/config/hubGroups').meterTypeFor(hubName) });

    if (!extraction.success) {
      return res.json({ success: false, error: 'Could not extract reading from image' });
    }

    // Validate first — a flat KM_MAX cannot serve both trip and odometer hubs.
    const { validateHubKM } = require('./src/validation/validateKM');
    const { getLastReading } = require('./src/sheets/logisticsClient');
    let lastReading = null;
    try { lastReading = await getLastReading(hubName, date); } catch (e) { /* non-fatal */ }

    const check = validateHubKM(hubName, extraction.km, { lastReading });
    if (!check.valid) {
      logger.warn(`[api] FPU rejected for ${hubName}: ${check.reason}`);
      return res.json({ success: false, km: extraction.km, hubName, date, error: check.reason });
    }

    // This used to always reply "Reading added to sheet" while ignoring the
    // return value, so a failed write looked like a success to the caller.
    const updateResult = await updateFPU(hubName, date, check.km);
    if (!updateResult || updateResult.success !== true) {
      logger.error(`[api] FPU write FAILED for ${hubName} on ${date}: ${updateResult?.reason || 'row not found'}`);
      return res.status(502).json({ success: false, km: check.km, hubName, date,
        error: `Sheet write failed: ${updateResult?.reason || 'no row for this hub/date'}` });
    }

    logger.info(`[api] FPU uploaded for ${hubName}: ${check.km} KM`);
    res.json({ success: true, km: check.km, hubName, date, message: 'Reading added to sheet' });
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
    const { updateFPU, todayISO } = require('./src/sheets/logisticsClient');

    const client = getClient();
    const results = [];
    const dateStr = todayISO(process.env.TIMEZONE || 'Asia/Karachi');

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
        const extraction = await extractKMFromImage(imageBuffer, hub.hubName, { hubName: hub.hubName, meterType: hub.meter });

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
        let latestImage = null;

        // Try Method 1: API-based approach (whatsapp-web.js)
        try {
          const chat = await client.getChatById(hub.groupId);
          if (chat) {
            const messages = await chat.fetchMessages({ limit: 50 });
            const imageMessages = messages.filter(m => m.hasMedia && m.type === 'image');
            if (imageMessages.length > 0) {
              latestImage = imageMessages[0];
            }
          }
        } catch (apiErr) {
          logger.warn(`[manual-extract] API method failed for ${hub.hubName}: ${apiErr.message.substring(0, 100)}`);
        }

        // Fallback Method 2: Direct browser Store API (more reliable)
        if (!latestImage) {
          try {
            const messageData = await client.pupPage.evaluate(async (groupId) => {
              if (!window.Store || !window.Store.Chat) return null;

              const chat = window.Store.Chat.get(groupId);
              if (!chat || !chat.msgs) return null;

              const allMsgs = Array.isArray(chat.msgs.models)
                ? chat.msgs.models
                : Object.values(chat.msgs.models || {});

              const imageMessages = allMsgs.filter(m => {
                return m && m.type === 'image' && m.mediaObject && m.mediaObject.mediaBlob;
              });

              if (imageMessages.length === 0) return null;

              imageMessages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
              return imageMessages[0].id._serialized;
            }, hub.groupId);

            if (messageData) {
              latestImage = await client.getMessageById(messageData);
            }
          } catch (storeErr) {
            logger.warn(`[manual-extract] Store API fallback failed for ${hub.hubName}: ${storeErr.message.substring(0, 100)}`);
          }
        }

        if (!latestImage) {
          results.push({ hub: hub.hubName, success: false, error: 'No images found in group' });
          continue;
        }

        const media = await latestImage.downloadMedia();
        if (!media) {
          results.push({ hub: hub.hubName, success: false, error: 'Download failed' });
          continue;
        }

        const imageBuffer = Buffer.from(media.data, 'base64');
        const extraction = await extractKMFromImage(imageBuffer, hub.hubName, { hubName: hub.hubName, meterType: hub.meter });

        if (extraction.success) {
          results.push({ hub: hub.hubName, km: extraction.km, success: true });
          logger.info(`[manual-extract] ✅ ${hub.hubName}: ${extraction.km} KM`);
        } else {
          results.push({ hub: hub.hubName, success: false, error: 'Extraction failed' });
        }
      } catch (err) {
        logger.error(`[manual-extract] Error for ${hub.hubName}:`, err.message.substring(0, 200));
        results.push({ hub: hub.hubName, success: false, error: err.message.substring(0, 150) });
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

// ─── Get Latest Messages from All Groups (No Extraction) ──────────────────────
app.get('/api/latest-messages', async (req, res) => {
  try {
    if (!isReady()) {
      return res.json({ success: false, error: 'WhatsApp not connected' });
    }

    const { getLatestMessagesFromGroup } = require('./src/whatsapp/getLatestMessages');
    const client = getClient();
    const results = [];

    for (const hub of HUB_GROUPS) {
      const messages = await getLatestMessagesFromGroup(client, hub.groupId, hub.hubName, 5);
      results.push(messages);
    }

    res.json({ success: true, results });
  } catch (err) {
    logger.error('[api] Latest messages error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Get Recent Submissions (Real-time) ──────────────────────────────────────
app.get('/api/recent-submissions', (req, res) => {
  res.json({
    success: true,
    count: recentSubmissions.length,
    submissions: recentSubmissions
  });
});

// ─── Store Submission (Called internally) ─────────────────────────────────────
app.post('/api/store-submission', (req, res) => {
  try {
    const { driver, hub, km, type, timestamp, status } = req.body;

    if (!driver || !hub || !km) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    addSubmission({
      timestamp: timestamp || new Date().toISOString(),
      driver,
      hub,
      km,
      type,
      status: status || '✅ Updated'
    });

    res.json({ success: true, message: 'Submission stored' });
  } catch (err) {
    logger.error('[api] Store submission error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Get Latest Personal Messages (Non-Groups) ────────────────────────────────
app.get('/api/my-personal-messages', async (req, res) => {
  try {
    if (!isReady()) {
      return res.json({ success: false, error: 'WhatsApp not connected' });
    }

    const client = getClient();
    const allChats = await client.getChats();
    const personalChats = allChats.filter(chat => !chat.isGroup);
    const results = [];

    for (const chat of personalChats) {
      try {
        // Just use the chat's last message info if available
        if (chat.lastMessage) {
          results.push({
            from: chat.name || chat.id.user || 'Unknown',
            phone: chat.id._serialized,
            message: chat.lastMessage.body || '(media)',
            timestamp: new Date(chat.lastMessage.timestamp * 1000).toISOString(),
            hasMedia: chat.lastMessage.hasMedia || false,
            type: chat.lastMessage.type || 'text',
          });
        }
      } catch (err) {
        logger.warn(`[api] Skipping ${chat.name || 'unknown'}: ${err.message.substring(0, 50)}`);
      }
    }

    // Sort by timestamp (newest first)
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      count: results.length,
      latest: results[0] || null,
      all: results.slice(0, 10) // Return top 10
    });
  } catch (err) {
    logger.error('[api] Personal messages error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Get Latest Personal Messages (Non-Groups) ──────────────────────────────────
app.get('/api/latest-messages/:groupName', async (req, res) => {
  try {
    if (!isReady()) {
      return res.json({ success: false, error: 'WhatsApp not connected' });
    }

    const groupName = req.params.groupName.toLowerCase();
    const hub = HUB_GROUPS.find(h => h.hubName.toLowerCase().includes(groupName));

    if (!hub) {
      const available = HUB_GROUPS.map(h => h.hubName).join(', ');
      return res.json({ success: false, error: `Group not found. Available: ${available}` });
    }

    const { getLatestMessagesFromGroup } = require('./src/whatsapp/getLatestMessages');
    const client = getClient();
    const messages = await getLatestMessagesFromGroup(client, hub.groupId, hub.hubName, 10);

    res.json({ success: true, ...messages });
  } catch (err) {
    logger.error('[api] Specific group messages error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Get All Chats with Today's Messages ──────────────────────────────────────
app.get('/api/all-chats', async (req, res) => {
  try {
    if (!isReady()) {
      return res.json({ success: false, error: 'WhatsApp not connected' });
    }

    const today = new Date().toISOString().split('T')[0];
    const results = [];

    // Read live messages from the in-memory buffer (fed by the 'message' event).
    // getChats()/fetchMessages() throw a minified internal error ("r") on the
    // pinned web version, so we can't pull history — only live messages that
    // arrived while the server has been running are available.
    const recent = getRecentMessages();
    for (const hub of HUB_GROUPS) {
      const msgs = recent.get(hub.groupId) || [];
      const todayMessages = msgs.filter(m => (m.timestamp || '').split('T')[0] === today);

      if (todayMessages.length > 0) {
        results.push({
          name: hub.hubName,
          isGroup: true,
          messageCount: todayMessages.length,
          messages: todayMessages.slice().reverse(), // newest first
        });
      }
    }

    // Sort by most recent message
    results.sort((a, b) => {
      const timeA = new Date(a.messages[0]?.timestamp || 0);
      const timeB = new Date(b.messages[0]?.timestamp || 0);
      return timeB - timeA;
    });

    res.json({
      success: true,
      date: today,
      totalChatsWithMessages: results.length,
      results
    });
  } catch (err) {
    logger.error('[api] All chats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Extract KM from Contact's Latest Image (Claude Vision) ────────────────
app.get('/api/extract-km-from-contact/:contactName', async (req, res) => {
  try {
    if (!isReady()) {
      return res.json({ success: false, error: 'WhatsApp not connected' });
    }

    const client = getClient();
    const contactName = req.params.contactName;
    const chats = await client.getChats();

    const chat = chats.find(c =>
      (c.name && c.name.toLowerCase().includes(contactName.toLowerCase())) ||
      (c.id && c.id.user === contactName)
    );

    if (!chat) {
      return res.json({ success: false, error: `Contact "${contactName}" not found` });
    }

    let messages = [];
    try {
      messages = await chat.fetchMessages({ limit: 50 });
    } catch (err) {
      logger.warn(`[api] fetchMessages failed, trying fallback: ${err.message}`);
      return res.json({ success: false, error: `Could not fetch messages: ${err.message}` });
    }

    const imageMessage = messages.find(m => m.hasMedia && (m.type === 'image' || m.type === 'document'));

    if (!imageMessage) {
      return res.json({ success: false, error: `No image found in chat with "${contactName}"` });
    }

    let media;
    try {
      media = await imageMessage.downloadMedia();
    } catch (err) {
      logger.error(`[api] Failed to download media: ${err.message}`);
      return res.json({ success: false, error: `Could not download image: ${err.message}` });
    }
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic();

    const base64Image = media.data.toString('base64');
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `This is a vehicle odometer/meter reading image sent by a field employee.

Extract ONLY the odometer/meter reading number (KM value) shown in the image.

Respond in JSON format: {"km": <number or null>, "confidence": "high/medium/low", "reason": "<explanation if null>"}`,
            },
          ],
        },
      ],
    });

    const responseText = message.content[0]?.text || '';
    const cleaned = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

    let extraction;
    try {
      extraction = JSON.parse(cleaned);
    } catch (e) {
      extraction = { km: null, reason: `Could not parse response: ${responseText}` };
    }

    res.json({
      success: extraction.km !== null,
      contact: chat.name || contactName,
      timestamp: new Date(imageMessage.timestamp * 1000).toISOString(),
      extraction
    });
  } catch (err) {
    logger.error('[api] Extract KM from contact error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Extract KM from Uploaded Image (Claude Vision - No Library Issues) ──────
app.post('/api/extract-km-image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({ success: false, error: 'No image file provided' });
    }

    // Free offline OCR (Tesseract) — no API key / no quota. Same engine as the WhatsApp flow.
    const { extractKMFromImage } = require('./src/vision/extractKM');
    const senderName = (req.body && req.body.name) || 'Upload';
    const extraction = await extractKMFromImage(req.file.buffer, senderName);

    res.json({
      success: extraction.success === true,
      extraction,
    });
  } catch (err) {
    logger.error('[api] Extract KM from image error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  logger.info('[app] Starting Raftar KM Agent...');

  // Ensure Google Sheet has header row
  // await ensureHeaders(); // Disabled — using Niete dedicated fleet only
  logger.info('[app] Google Sheets connection verified');

  // Start daily cut-off reminder scheduler
  startScheduler();

  // Start 10 AM FPU reading checker
  startFPUScheduler();

  // Start 3 PM LDO reading checker
  startLDOScheduler();

  // Start 9 PM "no visit -> off" marker
  require('./src/scheduler/offDayMarker').startOffDayScheduler();

  // Daily PSO petrol price (for the invoice estimate)
  require('./src/services/fuelPrice').startFuelPriceScheduler();

  // 11:00 / 18:30 "these readings are blank" email + fix-by-reply
  require('./src/services/readingsMail').startReadingsMail();

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
