# Navigation Index — Find Anything Fast

Read this when you need to find something. Every question has a path.

---

## 🚀 First Time Here? (5 minutes)

**Do this in order:**
1. Read `CLAUDE.md` (project overview) — 2 min
2. Read `status/CURRENT.md` (what we're focused on) — 2 min
3. Use this file to find anything else

---

## ❓ What Do You Need Right Now?

### "What's the current status?"
→ **`status/CURRENT.md`** — Updated weekly with what's running, what we're focused on, current capacity

### "What's broken / What's the error?"
→ 1. Check `logs/` for error messages
→ 2. Check `/docs/SCHEMA.md` for data structure
→ 3. Find relevant skill file in `/docs/patterns.md`

### "What are we building next?"
→ **`status/PENDING.md`** — Tahir's top 3 priorities with effort estimates

### "What happened in the last session?"
→ **`status/RECENT.md`** — Last 5 sessions summarized

### "How do I [solve a problem]?"
→ 1. Check `/docs/patterns.md` for skill names
→ 2. Read `/skills/[skill-name].md` for step-by-step
→ 3. Check `src/[domain]/` for code examples

### "What's the data structure / what columns exist?"
→ **`/docs/SCHEMA.md`** — COMPLETE reference (all columns, types, ranges, examples)

### "What APIs/integrations are we using?"
→ **`/docs/API.md`** — COMPLETE list (WhatsApp, Sheets, OSRM, Gemini, etc.)

### "How does the system fit together?"
→ **`/docs/ARCHITECTURE.md`** — Data flow, component relationships

### "Where's the WhatsApp code?"
→ **`/skills/whatsapp.md`** (pattern) + **`src/whatsapp/`** (code)

### "Where's the Sheets code?"
→ **`/skills/sheets.md`** (pattern) + **`src/sheets/`** (code)

### "Where's the distance/fuel code?"
→ **`/skills/distance.md`** (pattern) + **`/skills/fuel-pricing.md`** (pattern) + **`src/routes/`** (code)

### "How do I extract KM from images?"
→ **`/skills/vision.md`** (pattern) + **`src/vision/extractKM.js`** (code)

### "How do the schedulers work?"
→ **`/skills/scheduler.md`** (pattern) + **`src/scheduler/`** (code)

### "I need to run a utility script"
→ **`scripts/`** folder — All utilities with `scripts/README.md`

### "Where are old sessions/documents?"
→ **`_archive/`** — Historical context (read-only reference)

### "Where do I save learnings?"
→ **`~/.claude/projects/c--Raftar-ai-agent-starter/memory/`** — Auto-managed persistent memory

---

## 📚 By Use Case

### **Onboarding (First Time)**
1. `CLAUDE.md` — What is this?
2. `INDEX.md` (this file) — How do I find things?
3. `status/CURRENT.md` — What are we focused on?
4. `docs/patterns.md` — How do we solve problems?
5. `src/` — Browse code structure

### **Building a New Feature**
1. `docs/patterns.md` — What's the closest existing pattern?
2. `skills/[pattern].md` — Step-by-step instructions
3. `docs/SCHEMA.md` — What data do I have?
4. `src/[domain]/` — Find similar code
5. Code, test, save learnings to memory

### **Debugging an Issue**
1. `logs/` — What's the error message?
2. `docs/SCHEMA.md` — Is the data valid?
3. Find relevant `skills/[pattern].md` — How should this work?
4. `src/[domain]/code.js` — What's actually happening?
5. Fix, test, document lesson in memory

### **Understanding a Decision**
1. `status/RECENT.md` — When was this decided?
2. `docs/ARCHITECTURE.md` — Why did we design it this way?
3. `skills/[pattern].md` — What's the pattern behind it?

### **Adding Documentation**
1. New skill? → Create `skills/[name].md`
2. New integration? → Update `docs/API.md`
3. New process? → Update `docs/patterns.md`
4. Past lesson? → Save to memory in `~/.claude/projects/c--Raftar-ai-agent-starter/memory/`

---

## 🗂️ Folder Quick Reference

| Folder | What's Inside | When to Read |
|--------|---------------|--------------|
| **status/** | Current operations & focus | Weekly (always up-to-date) |
| **docs/** | Reference material (stable) | When learning APIs or architecture |
| **skills/** | Shareable skill patterns (15 files) | When building features |
| **context/** | Project background & history | Onboarding, scope decisions |
| **src/** | Application code (organized by domain) | Building/debugging features |
| **scripts/** | Utility tools (run manually) | Specific discovery/testing tasks |
| **logs/** | Runtime error logs | Debugging issues |
| **credentials/** | Secrets (API keys, tokens) | Setup only (DO NOT COMMIT) |
| **assets/** | Static files (logos, images) | Customizing UI |
| **output/** | Generated reports | Reviewing analysis results |
| **_archive/** | Old documents, old sessions | Historical reference only |

---

## ⚡ Most Used Files

This is what you'll see most often:

| File | Purpose | Updated |
|------|---------|---------|
| `CLAUDE.md` | Entry point & quick ref | This session |
| `INDEX.md` | This navigation guide | This session |
| `status/CURRENT.md` | Weekly focus | Weekly |
| `status/PENDING.md` | Top 3 priorities | Weekly |
| `status/RECENT.md` | Last 5 sessions | Per session |
| `docs/SCHEMA.md` | Data structure | When schema changes |
| `docs/API.md` | Integration reference | When APIs change |
| `docs/patterns.md` | All skills reference | When skills change |
| `src/[domain]/` | Application code | Continuously |

---

## 🔗 File Relationships

```
CLAUDE.md (entry point)
    ↓
INDEX.md (you are here)
    ↓
Specific question → status/ OR docs/ OR skills/
    ↓
Deep dive → src/[code]
    ↓
Learn something → Save to ~/.claude/memory/
    ↓
Next session → Reads memory + CLAUDE.md (loop closes)
```

---

## 💡 Pro Tips

**Tip 1:** Use `status/CURRENT.md` to understand current priorities before diving into code

**Tip 2:** Always check `docs/SCHEMA.md` before analyzing or modifying data

**Tip 3:** If a skill has an example, try that example first — it usually works

**Tip 4:** When adding a feature, check `skills/` first — 15 patterns cover 90% of what you'll build

**Tip 5:** Check `_archive/` if you want to understand why something was deprecated

**Tip 6:** If you're confused, ask: "Which file tells me about [thing]?" — Use this index to answer

---

## 🆘 Lost?

**If you can't find something:**

1. Check this index (most likely you'll find it)
2. Use `docs/patterns.md` (all skills listed with short descriptions)
3. Use `/logs/` (error messages often tell you which module failed)
4. Search `src/` for the domain you're working on

**Still stuck?** Update `status/CURRENT.md` with what you're trying to do, and I'll help.

---

**Last Updated:** 2026-04-21  
**Version:** 1.0 (Stable)  
**Purpose:** Make it impossible to be lost in this project
