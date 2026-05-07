# Skills — Shareable Knowledge Packages

This folder contains modular, shareable skill files. Each skill teaches one specific technique that can be used independently or combined.

---

## 📚 What is a Skill?

A skill is a markdown file containing:
- **Purpose:** What it enables
- **Prerequisites:** What you need first
- **Instructions:** Step-by-step walkthrough
- **Examples:** Real inputs and outputs
- **Common Mistakes:** Pitfalls to avoid
- **Code Reference:** Where the actual code lives
- **Notes:** Additional context

Each skill is designed to be:
- ✅ **Standalone:** You can read one skill without reading others
- ✅ **Practical:** Includes concrete examples and code references
- ✅ **Shareable:** Even non-agents can learn from these (use in chat interfaces)
- ✅ **Discoverable:** Organized alphabetically, linked from other files

---

## 📋 All Skills (15 Total)

### Core Principles (5 skills)
1. **preview-before-action.md** — Always show the result, wait for approval before executing
2. **free-cost-first.md** — Prioritize free solutions (OSRM > Maps, Gemini > paid)
3. **official-apis.md** — Use documented APIs over workarounds (exception: whatsapp-web.js)
4. **signature.md** — All outgoing messages end with "Sent by Raftar" only
5. **save-learnings.md** — Document lessons in memory after completing work

### Technical Integrations (7 skills)
6. **whatsapp.md** — Send/receive messages, fetch groups, download media
7. **sheets.md** — Read/write Google Sheets, update FPU/LDO/amounts
8. **distance.md** — Calculate route distances using OSRM
9. **fuel-pricing.md** — Dynamic fuel cost calculations (distance × fuel / 10)
10. **vision.md** — Extract KM from meter photos using Gemini Vision
11. **scheduler.md** — Run cron tasks (10AM FPU, 3PM LDO, 5PM reminders)
12. **location-override.md** — Parse coordinates, handle missing locations

### Supporting (3 skills)
13. **route-processing.md** — Batch process employee routes, calculate all distances
14. **communication-style.md** — Roman Urdu only, concise, action-oriented
15. **error-handling.md** — Log errors, maintain audit trail, recover gracefully

---

## 🎯 How to Use

### "How do I [do something]?"
1. Check `/docs/patterns.md` for skill names
2. Find the matching skill in this folder
3. Read the Instructions section
4. Follow the step-by-step guide
5. Reference code examples in `/src/`

### "What skills should I use for this task?"
See `/docs/patterns.md` → "Pattern Selection Guide"

### "I'm new, what should I read?"
1. `/CLAUDE.md` (project overview)
2. `/docs/patterns.md` (quick reference of all skills)
3. Individual skill files as needed

---

## 📖 Skill File Structure

Every skill has this format (so you know what to expect):

```markdown
# Skill: [Name]

## Purpose
One sentence describing what this skill enables.

## Prerequisites
- What access/knowledge is needed
- What must be set up first
- What constraints exist

## Instructions
1. Step one
2. Step two
3. Step three

## Examples
**Input:** [Concrete example input]
**Output:** [Expected output]

## Common Mistakes
- **Mistake 1:** Description of error
  - How to avoid/fix: Solution

- **Mistake 2:** Description of error
  - How to avoid/fix: Solution

## Code Reference
- **Location:** `/src/[path]/file.js`
- **Key functions:** [list of functions]
- **Last updated:** 2026-04-21

## Notes
[Additional context, gotchas, related patterns]
```

---

## 🔗 Skill Relationships

```
Core Principles (must read first)
├─ preview-before-action ← Applied to all others
├─ free-cost-first ← Applied to all technical decisions
├─ official-apis ← Applied to all integrations
├─ signature ← Applied to all outgoing messages
└─ save-learnings ← Applied at end of every task

Technical Skills (pick what you need)
├─ whatsapp ← Core integration
├─ sheets ← Core integration
├─ distance ← Uses OSRM
├─ fuel-pricing ← Uses distance calculations
├─ vision ← Uses Gemini API
├─ scheduler ← Runs tasks at specific times
└─ location-override ← Supports distance calculations

Supporting Skills (used as needed)
├─ route-processing ← Uses distance + sheets
├─ communication-style ← Used for all messages
└─ error-handling ← Used in all implementations
```

---

## 💡 Pro Tips

**Tip 1:** Start with Core Principles
- Read all 5 core principles first
- They apply to everything else
- Takes 10-15 minutes total

**Tip 2:** Learn by Example
- Each skill has concrete examples
- Try the example code yourself
- Modify slightly and test

**Tip 3:** Cross-Reference
- Skill files link to related skills
- Check "Notes" section for connections
- Use `/docs/patterns.md` to discover related skills

**Tip 4:** Keep Updated
- Each skill file dated
- If you improve a skill, update it + this file
- Mark "Last updated: [date]" so others know

---

## 🚀 Learning Path

**For Beginners:**
```
1. CLAUDE.md (2 min)
   ↓
2. Read ALL 5 core principles (15 min)
   ↓
3. Choose 1 technical skill (10 min)
   ↓
4. Implement following instructions (2-4 hours)
   ↓
5. Save learnings to memory (5 min)
```

**For Experienced:**
```
1. Check /docs/patterns.md (2 min)
   ↓
2. Find relevant skill (1 min)
   ↓
3. Skim Examples + Common Mistakes (2 min)
   ↓
4. Implement (1-3 hours)
   ↓
5. Done
```

---

## 📊 Skill Statistics

| Metric | Count |
|--------|-------|
| **Total skills** | 15 |
| **Core principles** | 5 |
| **Technical skills** | 7 |
| **Supporting skills** | 3 |
| **Lines of documentation** | 200+ per skill |
| **Code examples** | 40+ across all skills |
| **Last updated** | 2026-04-21 |

---

## 🆘 Finding What You Need

**"How do I send a WhatsApp message?"** → `/skills/whatsapp.md`

**"How do I update a Google Sheet?"** → `/skills/sheets.md`

**"How do I calculate distance?"** → `/skills/distance.md`

**"What's the signature format?"** → `/skills/signature.md`

**"How do I debug an error?"** → `/skills/error-handling.md` + `/docs/SCHEMA.md`

**"Can't find what you need?"** → Check `/docs/patterns.md` (master index)

---

## ✏️ Maintaining Skills

**When to create a new skill:**
- You've repeated something 3+ times
- It's complex enough to warrant documentation
- Others could benefit from learning it

**When to update a skill:**
- It's outdated (check date)
- You found a better approach
- A new edge case emerged
- Code location changed

**How to update:**
1. Edit the skill file
2. Update "Last updated" date
3. Note what changed in git commit
4. Update this README if structure changed

---

**Last Updated:** 2026-04-21  
**Purpose:** Provide shareable, modular knowledge packages  
**Usage:** Read → Learn → Implement → Save learnings → Next skill
