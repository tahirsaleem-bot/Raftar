# Raftar Agent Kaise Banaya — Zero se Live Tak (Complete Guide)

> Yeh file iss liye bani hai taake koi bhi banda apna AI agent zero se bana
> sake. Main (Claude, cloud agent) aur Tahir ne pehle din se aaj tak jo kaam
> kiya, uska poora tareeqa yahan step-by-step likha hai. Ismein sirf theory
> nahi — asli faisle, ghaltiyan, aur unke fix bhi likhe hain, taake agla banda
> wahi ghaltiyan dobara na kare.

**Project ka naam:** Raftar KM Agent
**Kya karta hai:** WhatsApp groups se gaari ki meter reading (photo) uthata hai,
usse KM number nikaalta hai (AI vision se), aur Google Sheet mein automatic
likh deta hai. Sath mein ek "People Analyzer" web app bhi hai (voice se kaam
log karo → AI assessment).

---

## 0. Sabse Pehle — Soch (Mindset)

Agent banane ka matlab yeh NAHI ke sirf ek chatbot bana lo. Agent ka matlab:

1. **Trigger** — koi cheez hoti hai (WhatsApp pe photo aayi, ya waqt ho gaya).
2. **Sochna (AI)** — us cheez ko samajhna (photo mein KM kitne hain?).
3. **Action** — us samajh pe amal (Google Sheet update karo).
4. **Memory** — jo hua use yaad rakhna, taake agli baar dobara na poochna pare.

Jab tak yeh 4 cheezein clear na hon, code likhna shuru mat karo. Hum ne bhi
pehle yeh tay kiya tha ke "kis group se, kya cheez, kahan jaani hai."

---

## 1. Environment Setup (Din 1)

Yeh cheezein pehle install/ready karni parti hain:

- **Node.js** (JavaScript runtime) — agent ka poora code isi pe chalta hai.
- **Ek code editor** — VS Code.
- **Terminal** — Windows pe PowerShell chalta hai. Terminal hamesha project
  folder mein khulna chahiye (`C:\Raftar\ai-agent-starter`).
- **Git + GitHub account** — code save aur deploy ke liye.

**Project ka dhaancha (structure):**
```
C:\Raftar\ai-agent-starter\      <- main agent (WhatsApp + Sheets)
  ├── index.js                   <- yahan se sab start hota hai
  ├── .env                       <- saari secret keys/config (git mein NAHI jaati)
  ├── credentials/               <- Google token, WhatsApp session
  ├── src/                       <- asli code (whatsapp, sheets, peopleAnalyzer)
  ├── scripts/                   <- chhoti chhoti alag task scripts
  └── public/                    <- web app ka UI
C:\Raftar\pa-app\                <- People Analyzer, deploy hone wala hissa
```

**Sabak:** Har secret (password, API key) `.env` file mein rakho. Kabhi code
ke andar seedha mat likho, aur `.env` ko kabhi GitHub pe push mat karo.

---

## 2. Pehla Building Block — WhatsApp se Judna

Hum ne `whatsapp-web.js` library use ki (yeh WhatsApp Web ko chalati hai).

**Kaam ka tareeqa:**
1. Program chalao → ek QR code screen pe aata hai.
2. Phone se WhatsApp → Linked Devices → QR scan.
3. Ek dafa scan karo, session `credentials/whatsapp-session-active/` mein save
   ho jaati hai. **Dobara QR scan ki zaroorat nahi** — restart pe khud login
   ho jaata hai.

**Config (.env):**
```
WHATSAPP_SESSION_PATH=./credentials/whatsapp-session-active
WHATSAPP_HEADLESS=true
WHATSAPP_CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

**Sabak / Ghalti jo hui:**
- "Detached Frame" ya "waitForChatLoading" errors aate the — matlab browser
  session atak gayi. **Fix:** Node band karo (`taskkill /IM node.exe /F`) aur
  `npm start` se dobara chalao. Session save hone ki wajah se dobara QR nahi.
- Puppeteer ka apna Chrome version match nahi karta tha, is liye system ka
  installed Chrome ka path dena para.

---

## 3. Dusra Block — AI se Samajhna (Vision / OCR)

Photo mein likha KM number nikaalne ke liye **Gemini Vision API** use ki.

- Model: `gemini-2.0-flash` (pehle `gemini-pro-vision` use kiya tha jo
  **deprecated** ho gaya tha — 404 deta tha, isliye badalna para).
- Kaam: photo bhejo → AI batata hai us mein kya number likha hai.

**Aqalmandi (smart logic) jo dali:**
- Subah **12 baje se pehle** aaya number = **FPU** (First Pickup — din shuru).
- **12 baje ke baad** = **LDO** (Last Dropoff — din khatam).
- Isse pata chalta hai ke reading din ki shuruaat ki hai ya aakhir ki.

**Sabak:**
- Free-tier API ka **daily quota** khatam ho jaata hai (429 error). Iska hal:
  ya to agle din tak intezaar, ya paid/nayi key, ya doosra AI (Claude Vision)
  fallback ke tor pe. Isliye code aisa banao ke ek AI fail ho to doosra chal
  sake — sirf ek pe depend mat raho.

---

## 4. Teesra Block — Google Sheets mein Likhna

Extract kiya hua KM automatic Google Sheet mein jaata hai.

- **Auth:** Google OAuth. Ek dafa login → token
  `credentials/google-token.json` mein save → phir khud-ba-khud chalta hai.
- **Sirf ek sheet use karo:** "Niete dedicated fleet" tab. (Purani "KM Records"
  sheet ko band kar diya taake confusion na ho — `.env` mein comment kar di.)
- Columns: `Sr No | Date | Regions | Coaches | Hub | Driver | Vehicle |
  Sign In | Sign Out | FPU Reading | LDO Reading | Total`

**Sabak:** Jitni cheezein "extra" lagti hain unhein band kar do. Ek clear
raasta rakho. Hum ne `ensureHeaders()` wala function bhi hata diya kyunke woh
har baar error de raha tha.

---

## 5. Chautha Block — Khud-ba-khud Chalna (Scheduling)

Agent ko banda har baar chalaye — yeh galat hai. Isliye **cron jobs** lagaye:

- **10:00 AM PKT** — FPU (subah wali reading) check.
- **3:00 PM PKT** — LDO (shaam wali reading) check.
- **7:00 PM & 9:00 PM** — agar data missing hai to reminder.

Timezone `Asia/Karachi` set kiya (warna waqt ghalat ho jaata).

**Sabak:** Real-time listener + scheduled checker dono chahiye. Listener foran
photo process karta hai; scheduler check karta hai ke kahin koi reh to nahi
gayi.

---

## 6. Panchwa Block — Memory (Sabse Zaroori)

Yeh woh cheez hai jo agent ko "agent" banati hai. Main har important cheez
memory files mein likhta hoon (`.claude/.../memory/`). Har file mein ek fact:

- Kaun user hai, kya pasand hai (Roman Urdu mein baat karo).
- Project ke faisle (kaunsa sheet, kaunse groups).
- Jo ghaltiyan hui aur kaise theek hui.

**Faida:** Agli session mein mujhe dobara sab poochna nahi parta. Naya banda bhi
in files ko parh ke seedha kaam samajh jaata hai.

**Sabak:** Agent ki taqat uski memory hai. Din 1 se cheezein likhna shuru karo.

---

## 7. Chhata Block — Deploy (24/7 Live Karna)

Local machine band ho to agent band. Isliye **Railway** pe deploy kiya
(People Analyzer app).

- **Repo:** GitHub `main` branch. `git push origin main` → automatic deploy.
- **Live URL:** https://raftar-production.up.railway.app/pa
- Secrets (`.env` wali cheezein) Railway ke settings mein daali — code mein nahi.

**Sabak / Ghalti:** Repo mein ek purani `master` branch thi jo Railway pe crash
karti thi. **Fix:** Railway ko sirf `main` branch pe rakha. Deploy ke liye
hamesha ek hi saaf branch decide karo.

---

## 8. Doosre Kaam bhi Kiye (Agent ki Range)

Ek hi agent ne aur kaam bhi seekhe — yeh dikhata hai ke agent extend hota hai:

- **Markaz Portal Automation (Puppeteer):** Taleemabad ka portal —
  self-assessment aur upward appraisal forms khud-ba-khud fill karta hai.
  **Usool:** hamesha bhar ke dikhata hai, **submit khud kabhi nahi karta** —
  banda review kar ke khud submit karta hai.
- **People Analyzer Web App:** awaaz se kaam log karo → English text → Google
  Sheet → cycle ke aakhir mein AI assessment.
- **Gmail integration:** emails parhna/summary — sahi mailbox verify karna
  zaroori (galat account suggest mat karo).

**Sabak:** Ek agent ek kaam se shuru hota hai, phir naye "skills" add hote
jaate hain. Har naya skill ek alag module/script hota hai.

---

## 9. Naya Agent Banane Ki Checklist (Kisi Aur Ke Liye)

Yeh woh tarteeb hai jo koi bhi follow kar sakta hai:

- [ ] **1. Maqsad likho** — Trigger, Sochna, Action, Memory (Section 0).
- [ ] **2. Environment** — Node.js, VS Code, Git, terminal ready.
- [ ] **3. `.env` banao** — saari keys/secrets yahan; GitHub pe kabhi nahi.
- [ ] **4. Input source jodo** — WhatsApp / Email / Form / API (jo bhi ho).
- [ ] **5. AI dimaag jodo** — text/vision samajhne ke liye (Gemini/Claude).
      Ek fail ho to doosra fallback rakho.
- [ ] **6. Output jodo** — Sheet / Database / Email — jahan natija jaana hai.
- [ ] **7. Scheduler** — cron se khud chalao; timezone theek karo.
- [ ] **8. Memory** — din 1 se har faisla/ghalti likho.
- [ ] **9. Test** — chhote data pe chala ke dekho, phir asli pe.
- [ ] **10. Deploy** — Railway/cloud pe, ek saaf branch se, secrets alag.
- [ ] **11. Review rule** — jo cheez risky ho (form submit, message bhejna)
      pehle dikhao, phir banda confirm kare.

---

## 10. Sab Se Bare Sabak (Ek Line Mein)

1. **Secrets `.env` mein, kabhi GitHub pe nahi.**
2. **Ek AI pe depend mat karo — fallback rakho** (quota khatam ho jaata hai).
3. **Session/token save karo** — baar baar login/QR se bacho.
4. **Ek clear raasta rakho** — extra cheezein band kar do.
5. **Memory din 1 se likho** — yeh agent ki asli taqat hai.
6. **Risky kaam auto mat karo** — pehle preview, phir insan confirm kare.
7. **Deploy ke liye ek branch decide karo** — warna crash.
8. **Ghalti aaye to root cause dhoondo** — andha retry mat karo.

---

## 11. Roz Chalane Ke Commands (Quick Reference)

```powershell
# Main agent start karna
cd C:\Raftar\ai-agent-starter
npm start
# Server port 3000 pe: Sheets connect -> Scheduler -> WhatsApp -> Ready

# Atak jaaye to restart
taskkill /IM node.exe /F
npm start

# People Analyzer app deploy karna (changes ke baad)
cd C:\Raftar\pa-app
git add .
git commit -m "apna message"
git push origin main        # Railway khud deploy kar deta hai
```

**Dashboard:** http://localhost:3000/dashboard
**Live app:** https://raftar-production.up.railway.app/pa

---

*Yeh guide Raftar project ke asli safar par bani hai. Isse parh kar koi bhi
apna pehla AI agent bana sakta hai — bas maqsad badlo, tareeqa wahi rahega.*
