# Pending Work — Top 3 Next Items

**Last Updated:** 2026-04-21

**What goes here:** The top 3 things Tahir wants built next, in priority order. Update when priorities change.

---

## Priority 1: Populate Team Members & Security Allowlist
**What:** Fill `src/validation/validateKM.js` with actual coach names + phone numbers. Fill `src/whatsapp/whatsappClient.js` ALLOWED_NUMBERS with authorized phone numbers.
**Why:** Currently all team members can submit readings (security hole) and daily reminders don't work because team list is empty. This unlocks both security and the 5PM reminder workflow.
**Effort Estimate:** 1 hour (just data entry)
**Dependencies:** Need list of all coaches with phone numbers
**Status:** Not started
**Blocked?** No (can proceed anytime with data)

## Priority 2: Add Retry Logic to Vision (Gemini) API
**What:** Wrap `src/vision/extractKM.js` Gemini calls with the retry utility (3 attempts with backoff). Currently image extraction fails silently on transient errors.
**Why:** If Gemini API briefly times out, the meter reading is lost. Retry ensures resilience.
**Effort Estimate:** 1 hour
**Dependencies:** None (retry utility already built in `src/utils/retry.js`)
**Status:** Not started
**Blocked?** No

## Priority 3: Send Email Alerts to Coaches (Manual Trigger)
**What:** Use `src/gmail/gmailClient.js` to send email alerts to coaches when readings are missing/overdue (on-demand, not automated).
**Why:** Gmail integration is ready; just need to wire it into manual commands for coaching/reminders.
**Effort Estimate:** 2 hours (build command structure + email templates)
**Dependencies:** None (Gmail client already built)
**Status:** Not started
**Blocked?** No

---

## Example Format (Delete After Adding Real Items)

```markdown
## Priority 1: Automated Coach Notifications
**What:** Send WhatsApp messages to coaches when KM readings are overdue (>12 hours past scheduled time)
**Why:** Coaches forget to submit readings; this will remind them automatically
**Effort Estimate:** 4 hours (combine existing scheduler + WhatsApp patterns)
**Dependencies:** None (both systems already built)
**Status:** Not started
**Blocked?** No

## Priority 2: Dashboard Analytics
**What:** Create a Google Sheets dashboard showing: Daily readings trend, Coach submission rate, Common failure times
**Why:** Need visibility into which coaches are struggling, when system issues happen
**Effort Estimate:** 6 hours (Sheets + Gemini Vision for automated analysis)
**Dependencies:** Requires analyzing meter_readings table structure
**Status:** Not started
**Blocked?** No (but need to finalize dashboard KPIs first)

## Priority 3: Multi-Language Support
**What:** Support Urdu + English in WhatsApp messages based on coach preference
**Why:** Some coaches prefer Urdu, some English; currently hardcoded to one
**Effort Estimate:** 3 hours (add language preference to Sheets, update templates)
**Dependencies:** Need to know how to store preferences in Logistics sheet
**Status:** Not started
**Blocked?** Yes (need to discuss schema change with Tahir)
```

---

## 📋 How This Works

**Every week:**
1. As items from Priority 1 complete → move to completed (in status/RECENT.md)
2. Priority 2 becomes Priority 1
3. Priority 3 becomes Priority 2
4. Add new Priority 3 from your backlog

**Format important because:**
- **What:** I know exactly what to build
- **Why:** I understand the business value (helps with design decisions)
- **Effort:** I can plan the session and set realistic expectations
- **Dependencies:** I can identify blockers before starting
- **Status:** I can update you on progress

---

## 🎯 Questions Before You List Items

Before adding to the pending list, think about:

1. **Is this clear?** Can you describe it in 2 sentences?
2. **Is this achievable?** Can it be built in 4-8 hours?
3. **Does it depend on anything?** Or can we start now?
4. **What's the business value?** Why does Raftar need this?

If you're not sure about any of these, let's discuss it first.

---

## 📝 How to Add Items

Just tell me: "Add to pending work: [item description]"

Example:
```
"Add to pending work: 
Send automated reminders to coaches when meter readings are overdue.
Business reason: Coaches forget; automation will improve submission rate.
Estimated effort: 4 hours.
No dependencies."
```

I'll format it correctly here.

---

**Last Updated:** 2026-04-21  
**Next Review:** Weekly (when priorities change)  
**Purpose:** Keep focused on the highest-value work
