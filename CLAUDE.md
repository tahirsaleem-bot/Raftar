# Project: Raftar KM Agent

Raftar is a comprehensive field operations system for managing logistics, distance calculations, meter readings, and team coordination with WhatsApp, Google Sheets, and automated scheduling.

## ✅ Current Status (As of 2026-04-21)
- **WhatsApp integration:** LIVE — Messages, groups, media downloads
- **Google Sheets integration:** LIVE — Read/write Logistics Operations sheet
- **Route distance calculation:** LIVE — OSRM distance, fuel consumption, smart amounts
- **Meter reading automation:** LIVE — Daily 10AM/3PM/5PM schedulers
- **Gemini Vision extraction:** LIVE — Image to KM extraction
- **Server:** Running 24/7 on Express.js

## 🎯 Current Focus
**Read:** `/status/CURRENT.md` for this week's priorities

## 🔴 Critical Rules (Non-Negotiable)
1. **ALWAYS preview before sending** — WhatsApp messages, emails, sheet changes. Show final result and wait for "yes"
2. **Free-of-cost first** — OSRM (free) not Google Maps; Gemini not paid APIs; node-cron not paid scheduling
3. **Official APIs only** — Exception: whatsapp-web.js (free tier workaround, justified)
4. **Signature:** All outgoing messages end with exactly `Sent by Raftar` — nothing else
5. **Roman Urdu only** — Never English-only, never Urdu script. This is non-negotiable

## 📊 My Preferences
- **Communication:** Concise, action-oriented, confirm assumptions
- **Reports:** Clear headings, tables for numbers, charts for trends
- **Iteration:** First outputs are imperfect—improve via feedback
- **Approval:** Always preview + get explicit "yes" before executing

## 📁 How to Navigate This Project
→ **First time?** Read this file, then `/INDEX.md`  
→ **Need something?** Use `/INDEX.md` to find it  
→ **Building a feature?** `/docs/patterns.md` → `/skills/[pattern].md` → `/src/[code]`  
→ **Debugging?** `/logs/` → `/docs/SCHEMA.md` → relevant skill file  

## 🔗 Quick Links by Task
| Task | Go To |
|------|-------|
| WhatsApp integration | `/skills/whatsapp.md` + `src/whatsapp/` |
| Google Sheets operations | `/skills/sheets.md` + `src/sheets/` |
| Distance/route calculation | `/skills/distance.md` + `src/routes/` |
| Fuel pricing logic | `/skills/fuel-pricing.md` + `src/routes/distanceCalculator.js` |
| Image KM extraction | `/skills/vision.md` + `src/vision/` |
| Scheduler patterns | `/skills/scheduler.md` + `src/scheduler/` |
| Data structure & columns | `/docs/SCHEMA.md` (COMPLETE) |
| All integrations list | `/docs/API.md` (COMPLETE) |
| System architecture | `/docs/ARCHITECTURE.md` |
| All working patterns | `/docs/patterns.md` (reference) |

## 💾 Database & Integration Details
| System | Type | Access | Schema |
|--------|------|--------|--------|
| Google Sheets | Logistics Operations | Read/Write | `/docs/SCHEMA.md` |
| OSRM | Distance API | Free, unlimited | `/docs/API.md#OSRM` |
| Gemini | Vision API | 1500 req/day free | `/docs/API.md#Gemini` |
| WhatsApp | whatsapp-web.js | Web-based | `/docs/API.md#WhatsApp` |

## ⚙️ Guardrails & Safety
- **WhatsApp:** Only scheduled messages, no direct AI replies without approval
- **Sheets:** Always preview all changes, never write without confirmation
- **Cost:** Free solutions first; paid only with explicit approval
- **Monitoring:** Check `/logs/` for errors; alert if failure patterns emerge

## 📌 Open Issues & Pending Work
**See:** `/status/PENDING.md` (Tahir's top 3 priorities)

## 🔍 Persistent Memory
**Location:** `~/.claude/projects/c--Raftar-ai-agent-starter/memory/`

This is where I save learnings, preferences, project state across sessions. You don't need to manage this—it's automatic. To check current state:
```bash
cat ~/.claude/projects/c--Raftar-ai-agent-starter/memory/project-state.md
```

---

**Last Updated:** 2026-04-21  
**Read Time:** 3 minutes  
**Next:** Open `/INDEX.md` for navigation, or check `/status/CURRENT.md` for focus
