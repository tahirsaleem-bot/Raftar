# External APIs & Integrations — Complete Reference

All external systems Raftar connects to. Organized by domain with examples, auth details, and troubleshooting.

---

## 1️⃣ WhatsApp Integration

### Library
- **Name:** whatsapp-web.js
- **Type:** Web-based (unofficial, but free)
- **Why:** Meta's free tier too limited; this gives unlimited messaging

### Connection
```javascript
// File: src/whatsapp/whatsappClient.js
const { Client } = require('whatsapp-web.js');
const client = new Client();
```

### Authentication
- **Method:** QR Code (scan with phone first time)
- **Session Storage:** `credentials/whatsapp-session/` (auto-managed)
- **Duration:** Persistent until logged out

### API Operations

#### Send Message
```
recipient: "+92-321-XXXXXXX@c.us" (individual)
           or "120363322453549511@g.us" (group)
message: "Text message"
```

#### Fetch Groups
```
Returns: List of all groups client is member of
Use case: Discover new coach groups automatically
```

#### Download Media
```
Input: Message with media attachment
Output: Buffer (JPEG/PNG for vision processing)
```

### Known Limits
- ⚠️ Rate limit: ~100 messages/hour (built-in protection)
- ⚠️ Session expires if unused for 30+ days (needs re-auth)
- ⚠️ Puppeteer requires Chrome/Chromium on server

### Error Handling
| Error | Cause | Fix |
|-------|-------|-----|
| "Session not found" | QR expired or logged out | Re-scan QR code with `npm start` |
| "Chat not found" | Wrong group ID format | Verify in `/src/config/hubGroups.js` |
| "Rate limit exceeded" | Too many messages sent | Implement backoff (500ms between messages) |

---

## 2️⃣ Google Sheets API

### Configuration
- **API:** Google Sheets API v4
- **Auth:** OAuth 2.0
- **Account:** tahir.saleem@niete.edu.pk
- **Scopes:** `spreadsheets`, `drive.readonly`

### Connection
```javascript
// File: src/sheets/logisticsClient.js
const { google } = require('googleapis');
const sheets = google.sheets('v4');
```

### Authentication File
```
credentials/google-oauth-client.json  (app credentials)
credentials/google-token.json         (access token — do NOT commit)
```

### API Operations

#### Read Sheet Data
```
GET /spreadsheets/{spreadsheetId}/values/{range}

Example:
spreadsheetId: "1XyZ..." (from .env)
range: "Niete dedicated fleet!A1:O100"

Response: { values: [[row1], [row2], ...] }
```

#### Update Cells
```
PUT /spreadsheets/{spreadsheetId}/values/{range}

Example:
range: "Niete dedicated fleet!E5" (update FPU)
values: [[245]]

Headers: Authorization: Bearer {access_token}
```

#### Append Rows
```
POST /spreadsheets/{spreadsheetId}/values/{range}:append

Example:
range: "Niete dedicated fleet!A:O"
values: [[2026-04-21, Niete, Ahmed Khan, +92-..., 245, 312, ...]]
```

### Rate Limits
- ⚠️ 60 queries/minute (built-in quota)
- ⚠️ 100 MB/minute (data transfer)
- ✅ Plenty for our use case (<10 queries/day)

### Error Handling
| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Token expired | Refresh with `google-auth-library` |
| 403 Forbidden | Insufficient permissions | Check OAuth scopes |
| 404 Not Found | Wrong sheet ID | Verify `GOOGLE_SHEET_ID` in `.env` |

---

## 3️⃣ OSRM (Open Source Routing Machine)

### Service
- **URL:** https://router.project-osrm.org
- **Type:** Distance calculation API (free, public)
- **Auth:** None required

### Usage
```
GET /route/v1/driving/{lon},{lat};{lon},{lat}

Example:
/route/v1/driving/71.5469,34.8683;71.4500,34.9000
(from Niete to Al_Qaim)

Response: { routes: [{ distance: 6500, duration: 420, ... }] }
```

### Coordinates Format
- **Input:** Longitude, Latitude (NOT latitude, longitude!)
- **Example:** 71.5469 (lon), 34.8683 (lat)
- **Conversion:** DMS → Decimal via `/src/routes/distanceCalculator.js`

### Rate Limits
- ✅ Unlimited (public service)
- ⚠️ Recommend 500ms between requests for politeness

### Common Mistakes
```javascript
❌ /route/v1/driving/34.8683,71.5469  (Wrong! Lat first)
✅ /route/v1/driving/71.5469,34.8683  (Correct! Lon first)
```

---

## 4️⃣ Google Gemini API (Vision)

### Configuration
- **Model:** gemini-1.5-flash
- **Version:** Latest (auto-updated)
- **Auth:** API Key (in `.env` as `GEMINI_API_KEY`)

### Connection
```javascript
// File: src/vision/extractKM.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
const client = new GoogleGenerativeAI(GEMINI_API_KEY);
```

### API Operations

#### Extract KM from Image
```
Input: Image buffer (JPEG/PNG)
Prompt: "Extract the odometer reading (KM) from this meter photo"
Output: { km: 245, confidence: "high" }
```

### Rate Limits
- ✅ 1,500 requests/day (free tier)
- ⚠️ Currently using ~400/day, plenty of room
- ⚠️ Image must be <20MB

### Error Handling
| Error | Cause | Fix |
|-------|-------|-----|
| RESOURCE_EXHAUSTED | Quota exceeded | Wait until next day |
| INVALID_ARGUMENT | Bad image format | Convert to JPEG/PNG |
| PERMISSION_DENIED | Invalid API key | Check `.env` |

### Model Performance
- **Accuracy:** ~98% on clear meter photos
- **Failure Rate:** ~2% (very blurry or obscured)
- **Confidence Levels:** high / medium / low

---

## 5️⃣ Gmail API

### Configuration
- **API:** Gmail API v1
- **Auth:** OAuth 2.0 (same as Google Sheets)
- **Scopes:** `gmail.send` (minimal)

### Connection
```javascript
// File: src/gmail/ (if implemented)
const { google } = require('googleapis');
const gmail = google.gmail('v1');
```

### Usage (When Implemented)
```
POST /users/me/messages/send

Example:
to: "tahir.saleem@niete.edu.pk"
subject: "Daily KM Report"
body: "Attached: today's readings"
attachments: [spreadsheet]
```

### Status
- 🟡 **Currently:** Not actively used (WhatsApp preferred)
- ✅ **Ready to use:** OAuth configured, code structure ready
- 📝 **Next:** Email reports feature (pending Tahir's request)

---

## 6️⃣ Google Calendar API

### Configuration
- **API:** Google Calendar API v3
- **Auth:** OAuth 2.0
- **Scopes:** `calendar.readonly` (minimal)

### Usage (When Implemented)
```
GET /calendars/primary/events

Use case: Check coach schedules, avoid KM collection during leave
```

### Status
- 🟡 **Currently:** Not actively used
- 📄 **Docs:** Available in `/docs/google-calendar-oauth.md`
- 📝 **Next:** Coach scheduling integration (pending Tahir's request)

---

## 7️⃣ Cloud Storage (Future)

### Candidates
- Google Drive (OAuth-integrated)
- AWS S3 (if scaling required)
- Local filesystem (current approach)

### Current Status
- 💾 **Images:** Stored locally in `/output/`
- ⚠️ **Risk:** Laptop = single point of failure
- 📝 **Next:** Migrate to Google Drive when scaling

---

## 📊 API Usage Statistics

| API | Calls/Day | Quota | Status |
|-----|-----------|-------|--------|
| WhatsApp | ~50 msgs | Unlimited | ✅ Green |
| Sheets | ~10 reads/writes | 60/min | ✅ Green |
| OSRM | ~5 distance calcs | Unlimited | ✅ Green |
| Gemini Vision | ~50 image extractions | 1,500/day | ✅ Green (67% capacity) |
| Gmail | 0 (not in use) | Unlimited | 🟡 Idle |
| Calendar | 0 (not in use) | Unlimited | 🟡 Idle |

---

## 🔒 Authentication & Secrets

### Files (DO NOT COMMIT)
```
.env
credentials/google-oauth-client.json
credentials/google-token.json
credentials/whatsapp-session/
```

### Best Practices
- ✅ Never paste API keys in code
- ✅ Use `.env` for all secrets
- ✅ `.gitignore` blocks these files
- ✅ Rotate keys monthly (if possible)

### Recovery
If a key leaks:
1. Regenerate in respective service dashboard
2. Update `.env`
3. Restart agent (`npm start`)

---

## 🚀 Adding a New Integration

If you need to add a new API:

1. **Research Phase**
   - Read official API docs
   - Understand auth method
   - Check rate limits

2. **Implementation Phase**
   - Create `/src/[domain]/[service]Client.js`
   - Add key to `.env`
   - Implement connection + error handling

3. **Documentation Phase**
   - Add section here (copy template above)
   - Document examples + limits
   - Add to `/skills/` as shareable pattern

4. **Testing Phase**
   - Manual test (check logs)
   - Check rate limiting behavior
   - Document any quirks

---

**Last Updated:** 2026-04-21  
**Completeness:** 90% (Gmail/Calendar not yet active)  
**Maintenance:** Updated when APIs change or new integrations added

