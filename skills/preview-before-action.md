# Skill: Preview Before Executing

## Purpose
Show exactly what will happen before sending messages, updating sheets, or making API calls. Get explicit approval from Tahir.

---

## Prerequisites
- Any action that affects external systems (WhatsApp, Sheets, email, API)
- Human must review and approve
- No exceptions (safety-critical)

---

## Instructions

### 1. Show the Message (Before Sending)
```
PREVIEW:
Recipients: Niete hub group (120363322453549511@g.us)
Message:
---
10:00 AM meter reading check time.
Please submit your FPU (starting KM) reading via WhatsApp photo.

Sent by Raftar
---

Ready to proceed? (yes/no)
```

### 2. Show the Sheet Update (Before Writing)
```
PREVIEW:
Update: Row 5 (Ahmed Khan, 2026-04-21)
Changes:
  E5: FPU = 245 KM (from image extraction)
  F5: LDO = 312 KM (waiting for evening submission)
  G5: Total = 67 KM (calculated)
  K5: Amount = 1,910 PKR (calculated)

Ready to proceed? (yes/no)
```

### 3. Show the API Call (Before Executing)
```
PREVIEW:
Action: Calculate distance (OSRM)
From: Niete (34.8683°N, 71.5469°E)
To: Al_Qaim (34.9000°N, 71.4500°E)
Expected result: ~6.5 KM

Ready to proceed? (yes/no)
```

---

## Examples

### WhatsApp Message Preview
```markdown
PREVIEW - WhatsApp Message:

Group: Niete hub (20 coaches)
Message:
---
سلام علیکم،

3:00 PM LDO میٹر ریڈنگ چیک ٹائم ہے۔
براہ کرم اپنی آخری KM ریڈنگ (LDO) فوٹو کے ساتھ بھیجیں۔

Sent by Raftar
---

Approve? (yes/no)
```

### Sheet Update Preview
```markdown
PREVIEW - Google Sheets Update:

Sheet: Logistics Operations
Tab: Niete dedicated fleet
Row: 5

Changes:
│ Column │ Current │ New  │ Reason              │
│--------|---------|------|---------------------|
│ E      │ empty   │ 245  │ FPU from image      │
│ F      │ empty   │ 312  │ LDO from image      │
│ G      │ empty   │ 67   │ Calculated (312-245)│
│ K      │ empty   │ 1910 │ Calculated formula  │

Approve? (yes/no)
```

---

## Common Mistakes

### Mistake 1: Previewing Without Details
❌ Bad: "Send message to group?" (unclear what message)  
✅ Fix: Show actual message text, recipient count, timestamp

### Mistake 2: Approving Without Understanding
❌ Bad: "Ready to proceed?" → User says "yes" without reading  
✅ Fix: Make preview impossible to miss (bold, clear formatting)

### Mistake 3: Silent Failures
❌ Bad: Send message without confirmation (user finds out later)  
✅ Fix: Always show preview BEFORE action, never after

### Mistake 4: Complex Changes Without Breaking Down
❌ Bad: "Updating 50 rows..." (what exactly is changing?)  
✅ Fix: Show specific changes row-by-row or in table

### Mistake 5: Forgetting to Show All Side Effects
❌ Bad: Show KM update, forget to show calculated Amount  
✅ Fix: Show all changes that will happen (visible + calculated)

---

## Code Reference
- **Pattern:** Not a file, but a working principle
- **Applied to:** All outgoing messages, sheet updates, API calls
- **Implementation:** Show preview in console/markdown, wait for "yes"
- **Last updated:** 2026-04-21

---

## Notes

1. **No exceptions:** Even small changes deserve preview
2. **Approval:** Explicit yes/no required (not "ok" or silence)
3. **Formatting:** Use markdown tables for complex changes
4. **Timing:** Always preview BEFORE, never after
5. **Auditing:** Log what was approved and what was executed
6. **Reversal:** Have a plan to undo if something goes wrong

---

**Last Updated:** 2026-04-21  
**Complexity:** Low  
**Linked Skills:** All others depend on this
