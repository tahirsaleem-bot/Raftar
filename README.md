# Raftar KM Agent

> **Field operations system for logistics, distance calculations, meter readings, and team coordination**

## 🚀 Quick Start

**New here?** Read [CLAUDE.md](./CLAUDE.md) first — it's the project entry point.

### Prerequisites
- Node.js ≥ 18.0.0
- WhatsApp account (for web-based automation)
- Google Sheets API credentials
- Gemini Vision API key

### Setup (2 minutes)
```bash
npm install
npm run setup
npm run test:connections
npm start
```

## 📋 Navigation

| Goal | Go To |
|------|-------|
| **Understand the project** | [CLAUDE.md](./CLAUDE.md) |
| **Find anything** | [INDEX.md](./INDEX.md) |
| **See this week's work** | [status/CURRENT.md](./status/CURRENT.md) |
| **Review architecture** | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |
| **Data schema & columns** | [docs/SCHEMA.md](./docs/SCHEMA.md) |

## ✨ Key Features

- **WhatsApp Integration** — Messages, groups, media (whatsapp-web.js)
- **Google Sheets Sync** — Real-time read/write to Logistics Operations
- **Distance Calculation** — OSRM routing, fuel consumption estimates
- **Meter Reading Automation** — Daily 10AM/3PM/5PM schedulers
- **Vision AI** — Gemini extracts KM from employee photos
- **24/7 Server** — Express.js with node-cron scheduling

## 📁 Project Structure

```
📂 status/              Weekly operational updates
📂 docs/               Reference documentation
📂 skills/             Reusable patterns & solutions
📂 src/                Application code (organized by feature)
📂 scripts/            Utility tools & automation
📂 credentials/        OAuth tokens (git-ignored)
📂 logs/               Runtime error logs
📂 _archive/           Historical working sessions
```

**See** [PROJECT_STRUCTURE.txt](./_archive/PROJECT_STRUCTURE.txt) for full spec.

## 🛠 Development

### Scripts
```bash
npm start              # Run production server
npm run dev           # Run with auto-reload (nodemon)
npm run setup         # First-time setup
npm run test:connections  # Verify API connections
```

### Running Utilities
```bash
node scripts/find-groups.js
node scripts/batch-process-routes.js
node scripts/fetchTodayReadings.js
# ... 26 utilities available in scripts/
```

## 📞 Support

- **Questions?** Check [CLAUDE.md](./CLAUDE.md) → [INDEX.md](./INDEX.md)
- **Bugs?** See [logs/](./logs/) and check [docs/SCHEMA.md](./docs/SCHEMA.md)
- **New feature?** Read [docs/patterns.md](./docs/patterns.md) first

---

**Last updated:** 2026-05-20 | **Status:** Production | **Uptime:** 24/7
