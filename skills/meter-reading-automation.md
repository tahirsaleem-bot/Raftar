# Skill: Meter Reading Automation

## Overview
Automatically fetch meter readings from WhatsApp hub groups, extract KM via AI Vision, and update Google Sheets daily.

## What It Does

### 10 AM — FPU (Morning) Readings
1. Fetch latest image from each hub group (last 4 hours)
2. Extract FPU reading via Gemini Vision
3. If no image → send reminder: "Please share your morning start reading"
4. Add today's empty rows to sheet
5. Write FPU to column J

### 3 PM — LDO (Evening) Readings
1. Fetch latest image from each hub group (last 8 hours)
2. Extract LDO reading via Gemini Vision
3. Calculate: Total = LDO − FPU
4. Update columns K (LDO) and L (Total)

## Hub Groups
| Hub | Group |
|-----|-------|
| E-9 AHQ | E-9 - Bara Kahu Niete |
| Lane 6 | Scheme 3 - Nilore Niete |
| Khawaja Corporation | Khwaja Corporation - Sihala Niete |
| Taramri Chowk | Taramri Chowk - Sihala Niete |
| H-13 Tarnol | H-13 - Tarnol Niete |
| I-10 Tarnol | I-10 - Tarnol Niete |
| Misrial Road | Misriyal road - I-14 - Tarnol Niete |

## Files
- `src/scheduler/fpuChecker.js` — 10 AM checker
- `src/scheduler/ldoChecker.js` — 3 PM checker
- `src/sheets/logisticsClient.js` — sheet operations
- `src/config/hubGroups.js` — group ID mapping

## Configuration
- `.env`:
  - `FPU_CHECK_TIME=10:00`
  - `LDO_CHECK_TIME=15:00`
  - `LOGISTICS_SHEET_ID=12nKyUZxrnH9kAtP8UAKrdAh5rWGBXSeO2tJjyjurG2E`
  - `LOGISTICS_SHEET_TAB=Niete dedicated fleet`

## Vision API
- **Provider:** Google Gemini
- **Model:** gemini-1.5-flash
- **Key:** `.env` GEMINI_API_KEY

## How to Test
```bash
npm start
```

Agent auto-runs cron jobs at 10 AM and 3 PM PKT. Check terminal logs for results.

## Troubleshooting

**"No image found" at 10 AM?**
- Agent sends reminder automatically
- Driver has until 3 PM to submit

**"Could not extract KM"?**
- Image quality issue or Gemini error
- Agent logs will show reason

**WhatsApp disconnected?**
- Cron jobs pause until reconnect
- Check terminal for errors
