// Raftar Dashboard — extracted static page (no WhatsApp/Puppeteer deps).
const express = require("express");
const router = express.Router();

router.get('/dashboard', (req, res) => {
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
      flex-wrap: wrap;
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
    .card h3 { color: #34d399; margin-bottom: 15px; font-size: 1.1rem; font-weight: 600; }
    .card-value { font-size: 2.5rem; color: #10b981; font-weight: bold; margin: 10px 0; }
    .card-desc { color: #888; font-size: 0.9rem; }
    .activity-log {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
      backdrop-filter: blur(10px);
    }
    .activity-log h3 { color: #d4a017; margin-bottom: 15px; }
    .activity-item {
      padding: 12px;
      background: rgba(255, 255, 255, 0.03);
      border-left: 3px solid #34d399;
      border-radius: 6px;
      margin-bottom: 10px;
      font-size: 0.9rem;
    }
    .activity-time { color: #888; font-size: 0.8rem; margin-top: 5px; }
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
    .fpu-ldo-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .fpu-box, .ldo-box { background: rgba(255, 255, 255, 0.02); padding: 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.05); }
    .fpu-box { border-left: 4px solid #3b82f6; background: rgba(59, 130, 246, 0.1); }
    .ldo-box { border-left: 4px solid #f59e0b; background: rgba(245, 158, 11, 0.1); }
    .status-label { font-size: 0.85rem; color: #a0aec0; margin-bottom: 5px; font-weight: 600; }
    .reading-value { font-size: 1.3rem; font-weight: bold; color: #10b981; }
    .reading-pending { font-size: 1.3rem; color: #fbbf24; font-weight: 600; }
    .reading-time { font-size: 0.8rem; color: #666; margin-top: 5px; }
    .reminder-badge { display: inline-block; background: #e74c3c; color: white; padding: 3px 8px; border-radius: 3px; font-size: 0.75rem; margin-top: 5px; }
    .submission-table { width: 100%; border-collapse: collapse; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; overflow: hidden; }
    .submission-table th { background: linear-gradient(135deg, rgba(52, 211, 153, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%); padding: 12px; text-align: left; color: #34d399; border-bottom: 2px solid rgba(52, 211, 153, 0.3); font-weight: 600; }
    .submission-table td { padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; background: rgba(34, 197, 94, 0.2); color: #10b981; }
    .hub-badge { display: inline-block; background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%); color: #60a5fa; padding: 4px 12px; border-radius: 4px; font-size: 0.85rem; border: 1px solid rgba(59, 130, 246, 0.3); }
    .footer { text-align: center; color: #666; font-size: 0.85rem; margin-top: 40px; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
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

    <!-- Statistics Grid -->
    <div class="grid">
      <div class="card"><h3>📸 Today's Submissions</h3><div class="card-value">12</div><div class="card-desc">Driver meter readings received</div></div>
      <div class="card"><h3>✅ Successfully Updated</h3><div class="card-value">12</div><div class="card-desc">All submissions processed</div></div>
      <div class="card"><h3>📊 Total KM</h3><div class="card-value">1,540</div><div class="card-desc">Meters recorded today</div></div>
      <div class="card"><h3>💬 Personal Messages</h3><div class="card-value">388</div><div class="card-desc">WhatsApp chats monitored</div></div>
      <div class="card"><h3>🎯 Success Rate</h3><div class="card-value">100%</div><div class="card-desc">No failures today</div></div>
      <div class="card"><h3>⏱️ Avg Response</h3><div class="card-value">2.3s</div><div class="card-desc">Processing time</div></div>
    </div>

    <!-- Real-Time Activity Log -->
    <div class="activity-log">
      <h3>⚡ Real-Time Activity Log (Last 10 Events)</h3>
      <div class="activity-item"><div><strong>✅ FPU Updated</strong> - E-9 AHQ: 240 KM (Hamza Khan)</div><div class="activity-time">16:50:15 PM PKT</div></div>
      <div class="activity-item"><div><strong>📸 Image Received</strong> - Lane 6: Picture from Driver</div><div class="activity-time">16:50:08 PM PKT</div></div>
      <div class="activity-item"><div><strong>✅ LDO Updated</strong> - Khawaja Corp: 189 KM (Ali Raza)</div><div class="activity-time">16:49:45 PM PKT</div></div>
      <div class="activity-item"><div><strong>🔍 KM Extracted</strong> - Taramri Chowk: 156 KM (OCR Success)</div><div class="activity-time">16:49:32 PM PKT</div></div>
      <div class="activity-item"><div><strong>📸 Image Received</strong> - H-13 Tarnol: Picture from Driver</div><div class="activity-time">16:48:20 PM PKT</div></div>
    </div>

    <!-- FPU/LDO Status for All 7 Hubs -->
    <div style="margin-bottom: 30px;">
      <h3 style="color: #d4a017; margin-bottom: 15px;">📊 FPU/LDO Status - All 7 Hubs</h3>
      <div class="hub-card"><div class="hub-name">🏢 E-9 AHQ</div><div class="fpu-ldo-row"><div class="fpu-box"><div class="status-label">🌅 FPU (10 AM)</div><div class="reading-value">240 KM ✅</div><div class="reading-time">Received at 09:50 AM</div></div><div class="ldo-box"><div class="status-label">🌆 LDO (3 PM)</div><div class="reading-pending">⏳ Pending</div><div class="reminder-badge">🔔 Reminder Sent</div></div></div></div>
      <div class="hub-card"><div class="hub-name">🏢 Lane 6</div><div class="fpu-ldo-row"><div class="fpu-box"><div class="status-label">🌅 FPU (10 AM)</div><div class="reading-value">178 KM ✅</div><div class="reading-time">Received at 10:05 AM</div></div><div class="ldo-box"><div class="status-label">🌆 LDO (3 PM)</div><div class="reading-value">145 KM ✅</div><div class="reading-time">Received at 17:30 PM</div></div></div></div>
      <div class="hub-card"><div class="hub-name">🏢 Khawaja Corp</div><div class="fpu-ldo-row"><div class="fpu-box"><div class="status-label">🌅 FPU (10 AM)</div><div class="reading-value">189 KM ✅</div><div class="reading-time">Received at 09:45 AM</div></div><div class="ldo-box"><div class="status-label">🌆 LDO (3 PM)</div><div class="reading-value">167 KM ✅</div><div class="reading-time">Received at 16:50 PM</div></div></div></div>
      <div class="hub-card"><div class="hub-name">🏢 Taramri Chowk</div><div class="fpu-ldo-row"><div class="fpu-box"><div class="status-label">🌅 FPU (10 AM)</div><div class="reading-pending">⏳ Pending</div><div class="reminder-badge">🔔 Reminder Sent</div></div><div class="ldo-box"><div class="status-label">🌆 LDO (3 PM)</div><div class="reading-pending">⏳ Pending</div></div></div></div>
      <div class="hub-card"><div class="hub-name">🏢 H-13 Tarnol</div><div class="fpu-ldo-row"><div class="fpu-box"><div class="status-label">🌅 FPU (10 AM)</div><div class="reading-value">203 KM ✅</div><div class="reading-time">Received at 10:20 AM</div></div><div class="ldo-box"><div class="status-label">🌆 LDO (3 PM)</div><div class="reading-value">186 KM ✅</div><div class="reading-time">Received at 17:15 PM</div></div></div></div>
      <div class="hub-card"><div class="hub-name">🏢 I-10 Tarnol</div><div class="fpu-ldo-row"><div class="fpu-box"><div class="status-label">🌅 FPU (10 AM)</div><div class="reading-pending">⏳ Pending</div></div><div class="ldo-box"><div class="status-label">🌆 LDO (3 PM)</div><div class="reading-pending">⏳ Pending</div></div></div></div>
      <div class="hub-card"><div class="hub-name">🏢 Misrial Road</div><div class="fpu-ldo-row"><div class="fpu-box"><div class="status-label">🌅 FPU (10 AM)</div><div class="reading-value">212 KM ✅</div><div class="reading-time">Received at 09:55 AM</div></div><div class="ldo-box"><div class="status-label">🌆 LDO (3 PM)</div><div class="reading-pending">⏳ Pending</div><div class="reminder-badge">🔔 Reminder Sent</div></div></div></div>
    </div>

    <!-- Recent Driver Submissions -->
    <div style="margin-bottom: 30px;">
      <h3 style="color: #d4a017; margin-bottom: 15px;">📋 Recent Driver Submissions (Today)</h3>
      <table class="submission-table">
        <thead><tr><th>Time</th><th>Driver</th><th>Hub</th><th>KM</th><th>Type</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>16:50:15</td><td>Hamza Khan</td><td><span class="hub-badge">E-9 AHQ</span></td><td>240</td><td>FPU</td><td><span class="status-badge">✅ Updated</span></td></tr>
          <tr><td>16:49:45</td><td>Ali Raza</td><td><span class="hub-badge">Khawaja Corp</span></td><td>189</td><td>LDO</td><td><span class="status-badge">✅ Updated</span></td></tr>
          <tr><td>16:49:32</td><td>Ahmed Malik</td><td><span class="hub-badge">Taramri Chowk</span></td><td>156</td><td>FPU</td><td><span class="status-badge">✅ Updated</span></td></tr>
          <tr><td>16:48:20</td><td>Sara Fatima</td><td><span class="hub-badge">H-13 Tarnol</span></td><td>203</td><td>LDO</td><td><span class="status-badge">✅ Updated</span></td></tr>
          <tr><td>16:47:05</td><td>Usama Pasha</td><td><span class="hub-badge">Lane 6</span></td><td>178</td><td>FPU</td><td><span class="status-badge">✅ Updated</span></td></tr>
        </tbody>
      </table>
    </div>

    <!-- Hub Performance -->
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

    <div class="footer"><p>✨ Raftar KM Agent — Automated Meter Reading System</p><p style="margin-top: 8px; font-size: 0.8rem; color: #555;">Last Updated: ${now}</p></div>
  </div>
</body>
</html>`);
});

module.exports = router;
