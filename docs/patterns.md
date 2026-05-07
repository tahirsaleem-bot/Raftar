# All Working Patterns — Quick Reference

**Note:** This is a quick reference. For detailed step-by-step instructions, see individual skill files in `/skills/` folder.

---

## 🎯 Core Working Principles

### 1. Build First, Ask Critical Blockers Only
Start building with sensible defaults rather than endless clarification. Trust the agent to make right choices.

### 2. Always Preview Before Executing
For ANY outgoing action (message, email, sheet change, API call), show the result and wait for explicit "yes".

### 3. Free-of-Cost Solutions First
When there's a choice, surface the free option first. Free > Official > Workarounds.

### 4. Official APIs Over Workarounds
Prefer documented, official APIs. Exception: whatsapp-web.js (free tier justified).

### 5. Communication: Signature Only
All outgoing messages end with exactly: `Sent by Raftar` — nothing else.

### 6. Save Learnings to Memory
After every successful task, save learnings. Close the loop.

---

## 📋 Technical Patterns (How-Tos)

### Pattern 1: WhatsApp Integration
**What:** Send/receive WhatsApp messages, fetch groups, download media  
**Library:** whatsapp-web.js  
**File:** `/src/whatsapp/whatsappClient.js`  
**Step-by-Step:** See `/skills/whatsapp.md`

### Pattern 2: Google Sheets Operations
**What:** Read/write Logistics Operations sheet, update FPU/LDO/amounts  
**API:** Google Sheets API v4  
**File:** `/src/sheets/logisticsClient.js`  
**Step-by-Step:** See `/skills/sheets.md`

### Pattern 3: Distance Calculation
**What:** Calculate distance between two points, extract KM from image, validate ranges  
**Tool:** OSRM (Open Source Routing Machine)  
**File:** `/src/routes/distanceCalculator.js`  
**Step-by-Step:** See `/skills/distance.md`

### Pattern 4: Fuel Pricing
**What:** Dynamic fuel pricing, amount calculation (distance × fuel / 10)  
**Source:** Manual updates or scraped daily  
**File:** `/src/routes/distanceCalculator.js` (lines 166-177)  
**Step-by-Step:** See `/skills/fuel-pricing.md`

### Pattern 5: Vision Extraction (Image → KM)
**What:** Extract KM numbers from meter photos using AI  
**Provider:** Google Gemini Vision  
**File:** `/src/vision/extractKM.js`  
**Step-by-Step:** See `/skills/vision.md`

### Pattern 6: Scheduler Tasks (Cron Jobs)
**What:** Run tasks at specific times (10AM FPU, 3PM LDO, 5PM reminders)  
**Library:** node-cron  
**Files:** 
- `/src/scheduler/fpuChecker.js` (10AM)
- `/src/scheduler/ldoChecker.js` (3PM)  
- `/src/scheduler/reminderSender.js` (5PM)  
**Step-by-Step:** See `/skills/scheduler.md`

### Pattern 7: Location Overrides
**What:** Parse DMS coordinates, handle missing locations, use override tables  
**File:** `/src/routes/schoolsData.js` + `/src/routes/distanceCalculator.js`  
**Step-by-Step:** See `/skills/location-override.md`

### Pattern 8: Route Processing (Batch)
**What:** Process multiple employee routes in batch, calculate distances for all  
**File:** `/src/routes/processEmployeeRoutes.js`  
**Step-by-Step:** See `/skills/route-processing.md`

### Pattern 9: Configuration Management
**What:** Hub groups, environment variables, constants  
**File:** `/src/config/hubGroups.js` + `.env`  
**Step-by-Step:** See `/skills/configuration.md` (if needed)

### Pattern 10: Error Logging
**What:** Log errors to file + console, maintain audit trail  
**File:** `/src/logger.js` + `/logs/app.log`  
**Step-by-Step:** See `/skills/logging.md` (if needed)

---

## 🛠️ Working Preferences

### Communication Style
- **Language:** Roman Urdu ONLY (never English-only, never Urdu script)
- **Tone:** Concise, action-oriented, confirm assumptions
- **Confirmation:** Always preview before executing
- **Style:** Clear headings, tables for data, charts for trends

### Technical Preferences
- **Free First:** OSRM > Maps, Gemini > Paid, node-cron > Services
- **APIs:** Official > Unofficial (documented, stable)
- **Data:** Always read schema before analyzing
- **Logging:** Log everything, audit trail is critical

### Iteration Style
- First outputs are imperfect — expect feedback cycles
- "Tell me what's wrong, what's missing, what angle is missing"
- Improvements compound: 1st iteration 50%, 2nd iteration 75%, 3rd iteration 90%+

---

## 🔄 Pattern Usage Flow

```
Question/Task
    ↓
Check docs/patterns.md (this file)
    ↓
Find relevant skill name
    ↓
Read /skills/[skill-name].md (detailed, step-by-step)
    ↓
Check /src/[domain]/ (actual code)
    ↓
Implement
    ↓
Test
    ↓
Save learnings to ~/.claude/memory/
    ↓
Next session reads updated memory (loop closes)
```

---

## 📚 All 15 Skills

| # | Skill | Purpose | File |
|----|-------|---------|------|
| 1 | Preview Before Action | Review before sending messages/changes | /skills/preview-before-action.md |
| 2 | Free-Cost First | Prioritize free solutions | /skills/free-cost-first.md |
| 3 | Official APIs | Use documented APIs | /skills/official-apis.md |
| 4 | Signature | End with "Sent by Raftar" | /skills/signature.md |
| 5 | Save Learnings | Document lessons after work | /skills/save-learnings.md |
| 6 | WhatsApp Integration | Send/receive messages, fetch groups | /skills/whatsapp.md |
| 7 | Sheets Operations | Read/write logistics data | /skills/sheets.md |
| 8 | Distance Calculation | Calculate route distances | /skills/distance.md |
| 9 | Fuel Pricing | Dynamic fuel cost calculations | /skills/fuel-pricing.md |
| 10 | Vision Extraction | Image → KM extraction | /skills/vision.md |
| 11 | Scheduler Patterns | Run cron jobs at specific times | /skills/scheduler.md |
| 12 | Location Overrides | Parse coordinates, handle missing data | /skills/location-override.md |
| 13 | Route Processing | Batch process employee routes | /skills/route-processing.md |
| 14 | Communication Style | Roman Urdu, concise, action-oriented | /skills/communication-style.md |
| 15 | Error Handling | Log errors, maintain audit trail | /skills/error-handling.md |

---

## 🎯 Pattern Selection Guide

**"I'm building a WhatsApp feature"**
→ Use Patterns: 1 (Preview) + 6 (WhatsApp) + 5 (Save Learnings)

**"I'm updating meter reading logic"**
→ Use Patterns: 1 (Preview) + 7 (Sheets) + 10 (Vision) + 15 (Error Handling)

**"I'm adding a new scheduler task"**
→ Use Patterns: 11 (Scheduler) + 1 (Preview) + 5 (Save Learnings)

**"I'm debugging a distance calculation"**
→ Use Patterns: 8 (Distance) + 12 (Location Override) + 15 (Error Handling)

**"I'm calculating fuel costs"**
→ Use Patterns: 9 (Fuel Pricing) + 8 (Distance) + 1 (Preview)

---

## 📖 How to Read Skills

Each skill file has:
1. **Purpose** — What it enables
2. **Prerequisites** — What you need first
3. **Instructions** — Step-by-step walkthrough
4. **Examples** — Real inputs/outputs
5. **Common Mistakes** — Pitfalls to avoid
6. **Code Reference** — Where to find it
7. **Notes** — Extra context

**Time to read one skill:** 5-10 minutes  
**Time to implement:** Varies (1-4 hours typically)

---

## ✅ Verification Checklist

Before considering a task complete:

- [ ] Code written and tested
- [ ] Error handling in place
- [ ] Logging added (audit trail)
- [ ] Preview shown before any outgoing action
- [ ] Confirmation received from Tahir
- [ ] Learnings saved to memory
- [ ] Code reviewed for security/performance
- [ ] Documentation updated

---

## 🚀 Quick Start Path

**New to Raftar? Start here:**

1. Read `CLAUDE.md` (project overview) — 2 min
2. Read `INDEX.md` (navigation) — 3 min
3. Read `/status/CURRENT.md` (current focus) — 2 min
4. Choose a pattern from this file that matches your task
5. Read the corresponding skill file in `/skills/`
6. Implement following the step-by-step guide
7. Test thoroughly
8. Save learnings to memory

---

**Last Updated:** 2026-04-21  
**Completeness:** 100% (all 15 patterns documented)  
**Usage:** Reference this file when asking "how do I do X?"
