# Skill: WhatsApp Integration

## Purpose
Send and receive WhatsApp messages, fetch groups, download media from coaches.

---

## Prerequisites
- WhatsApp account (Tahir's personal account)
- QR code authentication completed once (creates session file)
- `/src/config/hubGroups.js` contains hub-to-group mappings
- Server must be running (`npm start` or `pm2`)

---

## Instructions

### 1. Connect to WhatsApp
```javascript
const { Client } = require('whatsapp-web.js');
const client = new Client();
client.initialize(); // Connects using saved session
```

### 2. Send Message to Group
```javascript
const groupId = "120363322453549511@g.us"; // From hubGroups.js
const message = "10:00 AM FPU check time. Please submit meter photos.";
await client.sendMessage(groupId, message + "\n\nSent by Raftar");
```

### 3. Send Message to Individual
```javascript
const phoneNumber = "+92-321-5551234@c.us";
const message = "Hi Ahmed, your FPU reading is overdue.";
await client.sendMessage(phoneNumber, message + "\n\nSent by Raftar");
```

### 4. Fetch Groups
```javascript
const chats = await client.getChats();
const groups = chats.filter(chat => chat.isGroup);
groups.forEach(group => console.log(group.name, group.id._serialized));
```

### 5. Download Media
```javascript
const messages = await chat.fetchMessages();
const photoMessage = messages.find(m => m.hasMedia);
const media = await photoMessage.downloadMedia();
// media.data contains image buffer
```

---

## Examples

### Send Daily Reminder
```javascript
const hubGroups = require('./src/config/hubGroups.js');

async function sendReminder() {
  for (const [hub, groupId] of Object.entries(hubGroups)) {
    const message = `Daily reminder: Submit meter readings by 5 PM.\n\nSent by Raftar`;
    await client.sendMessage(groupId, message);
    await sleep(500); // Rate limiting: 500ms between messages
  }
}

sendReminder();
```

### Extract Image from WhatsApp
```javascript
async function processPhotoMessage(message) {
  if (!message.hasMedia) return;
  
  const media = await message.downloadMedia();
  const imageBuffer = Buffer.from(media.data, 'base64');
  
  // Pass to Gemini Vision
  const { extractKM } = require('./src/vision/extractKM.js');
  const { km, confidence } = await extractKM(imageBuffer);
  
  console.log(`Extracted: ${km} KM (${confidence})`);
  return km;
}
```

---

## Common Mistakes

### Mistake 1: Wrong Group ID Format
❌ Bad: `"120363322453549511"` (missing @g.us)  
✅ Fix: `"120363322453549511@g.us"` (group format)  
✅ Fix: `"+92-321-5551234@c.us"` (individual format, with +92 country code)

### Mistake 2: Forgetting Rate Limiting
❌ Bad: Send 100 messages in a loop (WhatsApp will block)  
✅ Fix: Add 500ms delay between messages
```javascript
await sleep(500); // 500ms between messages
```

### Mistake 3: Session Expiration
❌ Symptom: "Session not found" error  
✅ Fix: Restart server to re-authenticate
```bash
npm start  # Will prompt for QR code scan
```

### Mistake 4: Wrong Number Format
❌ Bad: `"3215551234"` (missing country code)  
✅ Fix: `"+92-321-5551234"` (include country code +92)

### Mistake 5: Forgetting "Sent by Raftar" Signature
❌ Bad: `"Hi Ahmed, submit readings"`  
✅ Fix: `"Hi Ahmed, submit readings\n\nSent by Raftar"`

---

## Code Reference
- **Main file:** `/src/whatsapp/whatsappClient.js`
- **Config:** `/src/config/hubGroups.js`
- **Library:** `whatsapp-web.js` (npm package)
- **Key functions:**
  - `sendMessage(chatId, message)`
  - `getChats()`
  - `downloadMedia()`
- **Last updated:** 2026-04-21

---

## Notes

1. **Rate limiting:** 500ms between messages is safe and polite
2. **Session persistence:** Saved at `credentials/whatsapp-session/` (auto-managed)
3. **Timeout:** Session expires if unused for 30+ days (re-scan QR)
4. **Allowlist:** Hard-coded bouncer checks `ALLOWED_NUMBERS` in index.js
5. **Security:** Only allows messages from specific coach phone numbers
6. **Scalability:** Can handle 50+ messages/hour without issues

---

**Last Updated:** 2026-04-21  
**Complexity:** Medium (lots of async operations)  
**Linked Skills:** signature, error-handling
