# Complete File Inventory & Understanding

**Purpose:** Explain what every file/folder brings and why we keep it

---

## Part 1: The 5 Archived Files — Should We Keep or Delete?

### File 1: `data-analysis.md` ❌ ORPHANED
**What it says:**  
"Turn raw query results into correct analysis outputs"

**What it actually describes:**  
Generic pattern for analyzing database data using SQL queries (schema-first approach, validation, transformations)

**Why it's orphaned:**
- ✗ Raftar doesn't use a database (uses Google Sheets instead)
- ✗ Not referenced anywhere in code
- ✗ Generic template from a database project
- ✗ 0 references in src/ files

**Real use case:**  
PostgreSQL → Analytics → Reports

**Raftar reality:**  
Google Sheets → No SQL queries needed

**Verdict:** ❌ **DELETE PERMANENTLY** (not applicable to Raftar)

---

### File 2: `database-connection.md` ❌ ORPHANED
**What it says:**  
"Set up an MCP connection to a database (read-only)"

**What it actually describes:**  
Generic pattern for connecting to databases via MCP server (credentials, schema setup, verification)

**Why it's orphaned:**
- ✗ Raftar has NO database (uses Google Sheets instead)
- ✗ Not referenced anywhere in code
- ✗ MCP database connection not used
- ✗ 0 references in src/ files

**Real use case:**  
PostgreSQL/MySQL + MCP server

**Raftar reality:**  
Google Sheets API (direct connection)

**Verdict:** ❌ **DELETE PERMANENTLY** (not applicable to Raftar)

---

### File 3: `planning-document.md` ⚠️ GENERIC TEMPLATE
**What it says:**  
"Turn a high-level idea into an execution-ready project plan"

**What it actually describes:**  
Generic template for creating project plans (phases, scopes, data models, KPIs, risks)

**Why it's orphaned:**
- ✗ Describes planning process, not actual feature
- ✗ Not referenced anywhere in code
- ✗ More about "how to plan" than "what to build"
- ✗ 0 references in src/ files

**Real use case:**  
Initial project discovery/planning meetings

**Raftar already has:**  
PENDING.md (actual priorities), CURRENT.md (status)

**Verdict:** ⚠️ **KEEP IN ARCHIVE** (reference only for future planning)

---

### File 4: `report-generation.md` ❌ NOT YET NEEDED
**What it says:**  
"Generate a durable Markdown report with charts/visualizations"

**What it actually describes:**  
Generic pattern for creating analysis reports (structure, charts, axis labels, KPIs)

**Why it's orphaned:**
- ✗ Raftar doesn't generate reports (yet)
- ✗ Not referenced anywhere in code
- ✗ Generic analytics pattern
- ✗ 0 references in src/ files

**Real use case:**  
Dashboard analytics, daily/weekly reports

**Raftar currently:**  
No report generation system

**Verdict:** ❌ **DELETE PERMANENTLY** (not yet needed, can add later if required)

---

### File 5: `google-calendar-connection.md` 🤔 CODE EXISTS BUT UNUSED
**What it says:**  
"Connect to Google Calendar via MCP server using OAuth"

**What it actually describes:**  
How to set up calendar integration with OAuth flow (credentials, reading events, writing events)

**Why it's orphaned:**
- ✗ Code exists (src/calendar/calendarClient.js) BUT...
- ✗ NOT wired into any endpoint or scheduler
- ✗ Not integrated in main flow (index.js)
- ✗ No API endpoints call it
- ✗ Never executed

**Real use case:**  
Schedule readings, send calendar invites

**Raftar currently:**  
No calendar features active

**Verdict:** ⚠️ **KEEP IN ARCHIVE** (code exists, might use later)

---

## Summary of the 5 Files

| File | Type | Delete? | Keep in Archive? | Reason |
|------|------|---------|------------------|--------|
| data-analysis.md | Generic | ✅ YES | NO | No database in Raftar |
| database-connection.md | Generic | ✅ YES | NO | Uses Sheets, not DB |
| planning-document.md | Generic | NO | ✅ YES | Reference for future |
| report-generation.md | Generic | ✅ YES | NO | No reports feature yet |
| google-calendar-connection.md | Partial | NO | ✅ YES | Code exists, might use |

---

## Part 2: Complete File Structure — What Each Brings

### Root Level Files (ai-agent-starter/)

#### Critical Files (Don't Delete)
```
index.js
  ├─ What: Main application file (34KB)
  ├─ Brings: Express server, all API endpoints, scheduler initialization
  ├─ Edit? FREQUENTLY (add new endpoints, fix routes)
  └─ Delete? ❌ NO (core of the app)

package.json
  ├─ What: Dependency manifest
  ├─ Brings: Lists all npm packages (whatsapp-web.js, googleapis, etc)
  ├─ Edit? RARELY (only when adding new packages)
  └─ Delete? ❌ NO (required to run)

package-lock.json
  ├─ What: Exact versions of all dependencies (145KB)
  ├─ Brings: Reproducible builds
  ├─ Edit? NEVER (auto-generated)
  └─ Delete? ❌ NO (ensures consistency)

.env
  ├─ What: Configuration & API keys
  ├─ Brings: Gemini key, Sheet IDs, port, timezone, limits
  ├─ Edit? OCCASIONALLY (when changing configs)
  └─ Delete? ❌ NO (never commit, but keep locally)
```

#### Documentation Files (Keep for Reference)
```
CLAUDE.md
  ├─ What: Project overview & rules (3.9KB)
  ├─ Brings: Clarity on purpose, principles, guardrails
  ├─ Edit? WEEKLY (update status, changes)
  └─ Delete? ❌ NO (entry point)

INDEX.md
  ├─ What: Navigation guide (6.5KB)
  ├─ Brings: Fast lookups (question → file)
  ├─ Edit? OCCASIONALLY (when file structure changes)
  └─ Delete? ❌ NO (helps find things)

FILL_IN_GUIDE.md
  ├─ What: Setup instructions (5.2KB)
  ├─ Brings: Onboarding documentation
  ├─ Edit? RARELY (only for new developers)
  └─ Delete? ❌ NO (useful for setup)

PROJECT_STRUCTURE.txt
  ├─ What: Text file describing folder organization (4.7KB)
  ├─ Brings: Redundant (INDEX.md is better)
  ├─ Edit? NO
  └─ Delete? ⚠️ OPTIONAL (can archive)

memory.md
  ├─ What: Persistent learnings (746B)
  ├─ Brings: Knowledge continuity across sessions
  ├─ Edit? AFTER EACH SESSION
  └─ Delete? ❌ NO (learning history)
```

#### IDE & Git Files
```
.cursorrules
  ├─ What: IDE rules for Cursor editor
  ├─ Brings: Consistent editing experience
  └─ Delete? NO

.gitignore
  ├─ What: Tells git what NOT to track
  ├─ Brings: Excludes node_modules, .env, credentials
  └─ Delete? ❌ NO (critical for security)
```

---

### Folders — What Each Brings

#### PRODUCTION CODE (Edit Frequently)
```
📂 src/ (176KB)
├─ whatsapp/              WhatsApp client, message sender, webhooks
├─ sheets/                Google Sheets read/write operations
├─ routes/                Distance calculation, employee route processing
├─ scheduler/             Cron jobs (10AM/3PM/5PM)
├─ vision/                Gemini image → KM extraction
├─ gmail/                 Email sending (partially used)
├─ calendar/              Calendar integration (built, not wired)
├─ alerts/                Coach alert system
├─ validation/            KM validation, team member checks
├─ utils/                 Retry logic, helpers
├─ config/                Configuration files, hub groups
└─ logger.js              Logging to file + console

Brings: ALL the actual functionality
Edit? ✅ FREQUENTLY (bug fixes, new features)
Delete? ❌ NO (this IS your app)
Keep? ✅ YES
```

#### DOCUMENTATION (Read Often, Update Weekly)
```
📂 skills/ (68KB)
├─ whatsapp.md                    ✅ ACTIVE (Send/receive messages)
├─ sheets.md                      ✅ ACTIVE (Read/write Sheets)
├─ distance.md                    ✅ ACTIVE (Calculate routes)
├─ vision.md                      ✅ ACTIVE (Extract KM from images)
├─ meter-reading-automation.md    ✅ ACTIVE (Schedulers 10AM/3PM/5PM)
├─ preview-before-action.md       ✅ PRINCIPLE (Always preview)
├─ README.md                      ✅ INDEX (List of skills)
└─ old-skills/ (archived)
   ├─ data-analysis.md
   ├─ database-connection.md
   ├─ planning-document.md
   ├─ report-generation.md
   └─ google-calendar-connection.md

Brings: Instructions on how to use each feature
Edit? OCCASIONALLY (when features change)
Delete? Keep active (7), archive old (5)
Keep? ✅ YES (reference material)
```

#### REFERENCE DOCUMENTATION (Read for Deep Dives)
```
📂 docs/ (72KB)
├─ SCHEMA.md              Data structure reference (all columns in Sheets)
├─ API.md                 External integrations (WhatsApp, Sheets, OSRM, Gemini)
├─ ARCHITECTURE.md        System design & data flow
└─ patterns.md            All working patterns (principles + technical)

Brings: Deep reference for understanding architecture
Edit? RARELY (when design changes)
Delete? ❌ NO
Keep? ✅ YES (understanding material)
```

#### TRACKING & STATUS (Update Weekly)
```
📂 status/ (24KB)
├─ CURRENT.md             What's running now (updated weekly)
├─ PENDING.md             Top 3 priorities for next work
├─ RECENT.md              Last 5 sessions summary
└─ INTEGRATION_AUDIT.md   Full health audit (we just created)

Brings: Status tracking, priorities, history
Edit? ✅ EVERY WEEK
Delete? ❌ NO
Keep? ✅ YES (decision-making docs)
```

#### CONTEXT & HISTORY (Read for Onboarding)
```
📂 context/ (5KB)
├─ README.md              Project background/history
└─ project-background.md  Context and learnings

Brings: Historical context (useful for understanding decisions)
Edit? RARELY
Delete? ❌ NO
Keep? ✅ YES (onboarding + context)
```

#### UTILITY SCRIPTS (Run Manually as Needed)
```
📂 scripts/ (173KB)
├─ setup.js               Initial setup automation
├─ test-connections.js    Test all integrations
├─ enable-apis.js         Enable Google APIs
├─ authorize.js           OAuth flow setup
├─ add-headers.js         Add column headers to Sheets
└─ (others)

Brings: One-off automation tools
Edit? RARELY
Delete? ❌ NO
Keep? ✅ YES (testing, setup)
```

#### SECRETS & CREDENTIALS (NEVER COMMIT)
```
📂 credentials/ (169MB)
├─ google-oauth-client.json    Google OAuth app credentials
├─ google-token.json           Active OAuth session token
└─ whatsapp-session/           WhatsApp connection cache

Brings: Integration secrets
Edit? NEVER
Delete? ❌ NO
Keep? ✅ YES (locally only, never git)
Add to .gitignore? ✅ YES
```

#### STATIC ASSETS (Don't Edit)
```
📂 assets/ (136KB)
├─ raftar-logo.jpg       Logo for dashboard

Brings: UI assets
Edit? RARELY
Delete? ❌ NO
Keep? ✅ YES
```

#### HISTORICAL BACKUPS (Don't Edit)
```
📂 _archive/ (144KB)
├─ old-skills/           (NEW) Orphaned skill documentation
├─ sessions/             Old WhatsApp sessions (backup)
└─ (other old files)

Brings: Historical reference, backups
Edit? NEVER
Delete? NO (safe storage)
Keep? ✅ YES (searchable history)
```

---

## Part 3: File Count Summary

### Total Files Breakdown

| Category | Files | Size | Keep/Delete |
|----------|-------|------|-------------|
| Source Code (src/) | 20 | ~176KB | ✅ KEEP (all active) |
| Skills Docs | 12 | ~68KB | ✅ KEEP active (7) |
| | | | ❌ ARCHIVE old (5) |
| Reference Docs | 4 | ~72KB | ✅ KEEP |
| Status/Tracking | 4 | ~24KB | ✅ KEEP |
| Scripts/Tools | 10 | ~173KB | ✅ KEEP |
| Context | 2 | ~5KB | ✅ KEEP |
| Config Files | 4 | ~1.8KB | ✅ KEEP |
| Credentials | ~3 | ~169MB | ✅ KEEP (never git) |
| Assets | 2 | ~136KB | ✅ KEEP |
| Archive Docs | ~50 | ~144KB | ✅ KEEP |
| **TOTAL** | **~130** | **~651MB** | |

### By Purpose

**Code & Docs:** ~350KB (meaningful human-readable files)  
**Dependencies:** ~200MB (required to run)  
**Credentials:** ~169MB (secrets)  
**Archives:** ~144KB (backup)  
**Git History:** ~11MB (version control)

---

## Part 4: Clarity — What Each Layer Brings

### Layer 1: CODE (src/)
**Files:** whatsapp/, sheets/, routes/, vision/, scheduler/, gmail/, calendar/, validation/, utils/, config/

**Brings:**
- WhatsApp → Messages in/out
- Sheets → Read/write data
- Routes → Distance calculation
- Vision → Image extraction
- Scheduler → Cron jobs (10AM/3PM/5PM)
- Gmail → Email (partial)
- Calendar → (built, not wired)
- Validation → Data checks

**Purpose:** FUNCTIONALITY (what the app actually does)

---

### Layer 2: DOCUMENTATION (docs/, skills/)
**Files:** SCHEMA.md, API.md, ARCHITECTURE.md, patterns.md, whatsapp.md, sheets.md, distance.md, vision.md, etc.

**Brings:**
- docs/SCHEMA.md → Data structure
- docs/API.md → External integrations
- docs/ARCHITECTURE.md → System design
- skills/*.md → How-to guides

**Purpose:** UNDERSTANDING (how to use/modify)

---

### Layer 3: STATUS (status/)
**Files:** CURRENT.md, PENDING.md, RECENT.md, INTEGRATION_AUDIT.md

**Brings:**
- CURRENT.md → What's running
- PENDING.md → What to do next
- RECENT.md → What we did
- INTEGRATION_AUDIT.md → Health check

**Purpose:** DIRECTION (priorities & health)

---

### Layer 4: INFRASTRUCTURE (credentials/, node_modules/, .git/)
**Files:** Credentials, dependencies, version control

**Brings:**
- Credentials → Secrets
- Dependencies → Libraries
- Git history → Version control

**Purpose:** FOUNDATION (required to run)

---

### Layer 5: ARCHIVE (_archive/)
**Files:** Old files, old skills, old code

**Brings:** Safety (historical backup)

---

## Part 5: My Recommendations

### For the 5 Archived Files

**Delete Permanently:**
- ❌ `data-analysis.md` (not applicable to Raftar)
- ❌ `database-connection.md` (not applicable to Raftar)
- ❌ `report-generation.md` (no reports feature yet)

**Keep in Archive:**
- ⚠️ `planning-document.md` (reference for future planning)
- ⚠️ `google-calendar-connection.md` (code exists, might use later)

**Current Status:** Left in `_archive/old-skills/` — safest option
- Out of the way (not confusing)
- Searchable if needed later
- Safe backup in case you change your mind

---

## Final Clarity for You

### ✅ What You MUST Have
- **src/** (code)
- **package.json** (dependencies list)
- **credentials/** (API keys)
- **.env** (settings)

### ✅ What You SHOULD Have
- **docs/** (architecture reference)
- **skills/** (active skills only — now 7 files)
- **status/** (priorities)

### ⚠️ What You CAN Archive
- Old documentation
- Old skills (✅ already done)
- Old code (git handles this)

### ❌ What You should DELETE
- Only if 100% certain never needed

### 🎯 Best Practice
**Keep archives** — they don't hurt. Delete only if space is critical.

---

**Created:** 2026-05-13  
**Purpose:** Complete understanding of file structure  
**Next:** Proceed with Steps 2-3 (team members, allowlist) when ready
