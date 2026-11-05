# WhatsApp Session Persistence Guide

## ✅ Session is Now Persistent!

Your WhatsApp authentication is **automatically saved** and will persist across app restarts.

---

## 📁 Where is the Session Saved?

```
C:\Raftar\ai-agent-starter\credentials\whatsapp-session-active\
```

This directory contains:
- ✅ Browser profile data
- ✅ Authentication tokens
- ✅ Device cache
- ✅ Local session storage

**NEVER DELETE** this folder unless you want to force a re-authentication (QR code scan).

---

## 🔄 How It Works

### First Run (QR Code Required)
```
1. npm start
2. App shows QR code
3. Scan with phone (Settings → Linked Devices → Link a Device)
4. ✅ Session saved automatically
```

### Subsequent Runs (No QR Code Needed)
```
1. npm start
2. App loads saved session from credentials/whatsapp-session-active/
3. ✅ Connected immediately
```

---

## 📋 Environment Variables

### Configuration (.env file)
```bash
# Session storage location (auto-created)
WHATSAPP_SESSION_PATH=./credentials/whatsapp-session-active

# Headless mode (browser runs without UI)
WHATSAPP_HEADLESS=true

# Chrome executable path (for Windows)
WHATSAPP_CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

---

## 🚨 When You Need to Scan QR Again

The session will be invalidated if:

| Scenario | Solution |
|----------|----------|
| You logged out from phone | Scan QR code again |
| You unlinked the device | Scan QR code again |
| Browser cache corrupted | Delete `credentials/whatsapp-session-active/` and scan QR |
| Got "LOGOUT" error | Clear session and re-authenticate |

### Force Fresh Authentication
```bash
# Option 1: Clear just the active session
rm -r credentials/whatsapp-session-active

# Option 2: Clear all WhatsApp sessions
rm -r credentials/whatsapp-session
rm -r credentials/whatsapp-session-active

# Then restart
npm start
```

---

## 📊 Session Status in Logs

### ✅ Healthy Session (Loaded from Cache)
```
[INFO] [app] Initializing WhatsApp...
[INFO] [whatsapp] Authenticated — session saved
[INFO] [whatsapp] Client ready — listening for messages
```

### ⚠️ Fresh Authentication (QR Code Needed)
```
[INFO] [app] Initializing WhatsApp...
[INFO] [whatsapp] QR code saved to: status/qrcode.png
✅ QR Code saved to: status/qrcode.png
```

### 🔴 Error (Session Invalid)
```
[WARN] [whatsapp] Disconnected: LOGOUT — reconnecting in 30s
```
→ Session expired, you need to scan QR code again

---

## 🔐 Security & Privacy

- ✅ **No cloud storage** — Session stays on your machine
- ✅ **No external servers** — All local
- ✅ **Browser-like behavior** — Same as WhatsApp Web
- ✅ **Safe** — whatsapp-web.js is open-source and audited

---

## 📱 Multiple Devices?

You can have multiple WhatsApp linked devices:

**On your phone:**
- Settings → Linked Devices → Link a Device
- Can link up to 4 devices simultaneously

**In this app:**
- One session per installation
- Each app installation = one linked device

---

## 🛠️ Advanced: Custom Session Path

If you want to store sessions elsewhere:

```bash
# Edit .env
WHATSAPP_SESSION_PATH=/custom/path/whatsapp-session

# Or set environment variable
$env:WHATSAPP_SESSION_PATH = "D:\backups\whatsapp-session"
npm start
```

---

## ✨ Pro Tips

1. **Backup your session** — Copy the `credentials/` folder periodically
2. **Don't share** — Never share the `credentials/` folder (contains auth tokens)
3. **Monitor logs** — Check `logs/app.log` for connection status
4. **Test after restart** — After restarting, verify with:
   ```bash
   curl http://localhost:3000/api/manual-fpu-extract
   ```

---

## 🎯 Summary

| What | Where | Status |
|------|-------|--------|
| Session Storage | `credentials/whatsapp-session-active/` | ✅ Persistent |
| QR Code Needed | Only on first run | ✅ Once |
| Restart Behavior | Loads cached session | ✅ No QR needed |
| Logout Detection | Auto-reconnects with QR | ✅ Automatic |
| Environment Config | `.env` file | ✅ Documented |

---

**Last Updated:** 2026-06-03  
**Status:** ✅ WhatsApp Session Persistence Enabled
