# Utility Scripts — One-Off Tools

This folder contains utility scripts for discovery, testing, and manual operations. These are NOT part of the main app—run manually when needed.

---

## 🔧 Script Categories

### Meter Reading Scripts
- **manual-fpu-fetch.js** — Manually fetch FPU readings (when scheduler is down)
- **quick-meter-fetch.js** — Quick meter data fetch for testing
- **fetch-today-readings.js** — Fetch today's readings from WhatsApp

### Sheet Formatting Scripts
- **add-headers.js** — Add column headers to a sheet
- **add-section-with-header.js** — Add new section with proper header
- **add-today-rows.js** — Add today's date rows to sheet
- **format-sheet.js** — Format sheet layout (colors, borders, etc.)
- **insert-header-before-data.js** — Insert headers properly above data

### Data Generation Scripts
- **home_coordinates_generated.js** — Generate home/office coordinates
- **schools_overrides_generated.js** — Generate school location overrides

### Discovery Scripts
- **find-groups.js** — Find all WhatsApp groups (for discovery)
- **find-sheet-id.js** — Find sheet IDs from account

### Testing & Verification
- **test-row-2484.js** — Test row processing (for debugging)
- **verify-fix.js** — Verify that a fix worked
- **batch-process-routes.js** — Batch process employee routes

### Other
- **sync-coaches.js** — Sync coach list from WhatsApp to Sheets

---

## 📖 How to Run Scripts

### Basic Usage
```bash
cd /c/Raftar/ai-agent-starter
node scripts/[script-name].js
```

### Example: Find All Groups
```bash
node scripts/find-groups.js
# Output: List of all WhatsApp groups + IDs
```

### Example: Quick Meter Fetch
```bash
node scripts/quick-meter-fetch.js
# Output: Today's meter readings
```

---

## 🎯 When to Use

| Need | Script | Example |
|------|--------|---------|
| **Find WhatsApp groups** | find-groups.js | "What groups is the agent in?" |
| **Test a change** | test-row-2484.js | "Did my formula fix work?" |
| **Fetch readings manually** | manual-fpu-fetch.js | "Scheduler is down, need readings" |
| **Add sheet headers** | add-headers.js | "New sheet needs proper headers" |
| **Process all routes** | batch-process-routes.js | "Calculate all route distances" |
| **Find sheet ID** | find-sheet-id.js | "What's the ID of this sheet?" |

---

## ⚠️ Safety Notes

1. **These modify data** — Always backup your Sheets before running
2. **No undo** — Some scripts make permanent changes; be sure before running
3. **Run manually** — These don't run automatically like the scheduler
4. **Log output** — Check output/logs for what happened
5. **One at a time** — Don't run 2 scripts simultaneously

---

## 🔍 Script Details

### find-groups.js
```bash
What: Find all WhatsApp groups
When: Need to discover new groups for hub mapping
Status: Safe (read-only)
Output: List of group names + IDs
Usage: node scripts/find-groups.js
```

### manual-fpu-fetch.js
```bash
What: Manually trigger FPU check (for testing)
When: Scheduler is down, need immediate readings
Status: Modifies Sheets (use with caution)
Output: Updated FPU column + log entry
Usage: node scripts/manual-fpu-fetch.js
```

### test-row-2484.js
```bash
What: Test specific row processing
When: Debugging a specific coach's data
Status: Test-only (doesn't modify prod data)
Output: Debug output + validation results
Usage: node scripts/test-row-2484.js
```

### batch-process-routes.js
```bash
What: Calculate distance for all employee routes
When: Need to process entire team at once
Status: Modifies Sheets (adds distance columns)
Output: Updated distance + amount columns
Usage: node scripts/batch-process-routes.js
```

---

## 🚨 Common Issues

### "Script not found"
❌ Error: `Cannot find module`  
✅ Fix: Make sure you're in project root directory
```bash
pwd  # Should output: /c/Raftar/ai-agent-starter
```

### "Google Sheets connection failed"
❌ Error: `401 Unauthorized`  
✅ Fix: Check `.env` has GOOGLE_SHEET_ID
```bash
cat .env | grep GOOGLE_SHEET_ID
```

### "WhatsApp session not found"
❌ Error: `Session not found`  
✅ Fix: Run main app first to create session
```bash
npm start  # Will create WhatsApp session
```

### "Trying to modify protected columns"
❌ Error: `Permission denied` on Sheets update  
✅ Fix: Ensure target columns are not protected

---

## 📝 Creating a New Script

If you need a new utility script:

1. **Create file:** `scripts/my-script.js`
2. **Add header comment:**
```javascript
/**
 * What this script does
 * When to use: [When needed]
 * Safety: [read-only / modifies data / testing]
 */
```
3. **Add to this README** — Document it above
4. **Test thoroughly** — Run once, verify output
5. **Document results** — Add notes about what it does

---

## 🔄 Maintenance

- **Review monthly:** Are there scripts that aren't used?
- **Archive old scripts:** Move unused scripts to `_archive/scripts/`
- **Update documentation:** Keep this README in sync
- **Add error handling:** All scripts should handle failures gracefully

---

**Last Updated:** 2026-04-21  
**Scripts Count:** 15 utilities  
**Purpose:** Provide manual tools for discovery, testing, and maintenance
