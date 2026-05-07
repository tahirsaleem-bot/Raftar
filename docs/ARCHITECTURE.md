# Raftar Agent Architecture

## Overview
Autonomous WhatsApp agent that automates daily KM tracking for field teams.

## Core Components

### 1. WhatsApp Layer
- **Client:** `whatsapp-web.js` (QR scan — no Meta API needed)
- **Session:** Persisted at `credentials/whatsapp-session/`
- **File:** `src/whatsapp/whatsappClient.js`
- **Security:** Hard allowlist bouncer checks sender phone number

### 2. Vision Layer
- **Provider:** Google Gemini API
- **Model:** gemini-1.5-flash
- **File:** `src/vision/extractKM.js`
- **Input:** Image buffer (JPEG/PNG)
- **Output:** `{ km: <number>, confidence: "high|medium|low" }`

### 3. Google Sheets Layer
- **Auth:** OAuth 2.0 (tahir.saleem@niete.edu.pk)
- **Spreadsheet:** Logistics Operations (ID in `.env`)
- **Tab:** Niete dedicated fleet
- **File:** `src/sheets/logisticsClient.js`
- **Operations:**
  - Read sheet data
  - Find hub rows by date + name
  - Update FPU, LDO, Total columns
  - Append new rows

### 4. Scheduler Layer
- **Library:** node-cron
- **Jobs:**
  - 10:00 AM PKT — FPU readings + reminders (`fpuChecker.js`)
  - 3:00 PM PKT — LDO readings + totals (`ldoChecker.js`)
  - 7:00 PM PKT — Missing reading reminders (future)
- **Timezone:** Asia/Karachi (configurable in `.env`)

### 5. HTTP Server
- **Framework:** Express.js
- **Port:** 3000 (configurable in `.env`)
- **Routes:**
  - `GET /` — Status page with logo
  - `GET /health` — Health check

## Data Flow

```
WhatsApp Group Image
    ↓
WhatsApp Client (whatsapp-web.js)
    ↓
Vision (Gemini extractKM)
    ↓
Validation (KM range check)
    ↓
Google Sheets (update)
    ↓
Logs (audit trail)
```

## Configuration

### Environment Variables (`.env`)
```
GEMINI_API_KEY=<your-key>
GOOGLE_SHEET_ID=<logistics-sheet-id>
LOGISTICS_SHEET_TAB=Niete dedicated fleet
FPU_CHECK_TIME=10:00
LDO_CHECK_TIME=15:00
PORT=3000
TIMEZONE=Asia/Karachi
```

### Credentials
- `credentials/google-oauth-client.json` — OAuth app credentials
- `credentials/google-token.json` — OAuth access token
- `credentials/whatsapp-session/` — WhatsApp session (auto-created on QR scan)

### Hub Configuration
- `src/config/hubGroups.js` — WhatsApp group IDs mapped to hub names

## Deployment

### Local (Laptop)
```bash
npm start
```

### Always-On (PM2)
```bash
pm2 start index.js --name raftar
pm2 startup
pm2 save
```

### Cloud (Not Yet)
- WhatsApp session storage issue (needs persistent volume)
- Chrome/Puppeteer dependency (not ideal on serverless)
- Recommend: VPS or home server

## Security

1. **WhatsApp:** Hard allowlist bouncer (ALLOWED_NUMBERS array)
2. **Google:** OAuth with minimal scopes
3. **Logs:** All actions logged to `logs/app.log`
4. **Validation:** KM range check (1–500 km)

## Testing

```bash
# Test all connections
npm run test:connections

# View logs
tail -f logs/app.log

# Manual FPU check (for testing)
node -e "require('./src/scheduler/fpuChecker').runFPUCheck()"
```

## Future Enhancements

- [ ] Retry logic for failed Gemini calls
- [ ] Manual reading submission via WhatsApp command
- [ ] Dashboard to view daily readings
- [ ] Email reports to stakeholders
- [ ] Multi-sheet support (for multiple logistics teams)
- [ ] Redis caching for performance

## Troubleshooting

**Agent not starting?**
- Check `.env` for missing keys
- Verify WhatsApp session exists
- Check logs: `tail -f logs/app.log`

**Readings not uploading?**
- Verify Google Sheet ID and tab name
- Check OAuth token validity
- Review Gemini API quota

**WhatsApp disconnected?**
- Agent will reconnect automatically
- Manual reconnect: restart with `npm start`
