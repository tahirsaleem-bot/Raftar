---
name: railway-deploy
description: Deploy any project to a shared Railway workspace using Railway CLI (railway up). Prevents duplicate projects, duplicate services, and failed or conflicting deployments. Deployment by CLI only — no GitHub repo connection. On first run check if the project exists before creating; use product/app names (not student names).
disable-model-invocation: false
argument-hint: "[app-name] or [service-name]"
allowed-tools: Bash(railway *), Bash(git *), Read, Write
---

# Railway Deploy Skill — Simple & Safe

**For:** Any project deployed to the **Rumi Deployments** Railway workspace
**Method:** Railway CLI (`railway up`) — **CLI ONLY, no GitHub connection**
**Risk Level:** HIGH — affects production; prevents concurrent/duplicate/failed deploys

---

## Your Configuration

| Setting | Value |
|---|---|
| Your Folder | `ahsan-javed` |
| Railway Project | `ahsan-javed` |
| Railway Service | `Invenza` |

---

## Overview

This skill ensures safe, repeatable deployments to the shared **Rumi Deployments** Railway workspace. It:

- ✅ Uses Railway CLI authentication (no API tokens, no `.env` needed)
- ✅ Prevents duplicate projects (checks if the project already exists before creating)
- ✅ Uses product/app names for services, not student names
- ✅ CLI-only deployment (`railway up`) — no GitHub repo connection
- ✅ Verifies the correct workspace (always **Rumi Deployments**)
- ✅ Prevents concurrent deployments (aborts if one is already running)
- ✅ Checks git is clean (no uncommitted changes)
- ✅ Monitors deployment in real-time
- ✅ Verifies post-deploy health (logs, no crashes)
- ✅ Provides rollback if something goes wrong

---

## First-Run Setup (One-Time Only)

### 1. Authenticate with Railway
```bash
railway login
```
This will:
- Open your browser to railway.app
- Prompt you to authorize Claude Code access
- Save your credentials locally (never stored in `.env` or committed to git)

### 2. Find or Create Your Project
**Important:** Before creating a new project, check if one already exists.
```bash
# List all projects
railway project list
```
- Look for: `ahsan-javed`
- If it **exists** → go to step 3
- If it does **NOT** exist → continue below

**If your project does NOT exist:**
```bash
railway project create ahsan-javed
railway project switch ahsan-javed

# Create service with your APP NAME (not your student name)
railway service create Invenza
```

**If your project DOES exist:**
```bash
railway project switch ahsan-javed
```

### 3. Verify Setup
```bash
railway whoami
# Should show: "Rumi Deployments" workspace

railway status
# Should show: ahsan-javed (project) → Invenza (service)
```

---

## How to Use
```bash
# Deploy to your linked service
/railway-deploy

# Or specify a service
/railway-deploy Invenza
```

---

## ⛔ CRITICAL: Deployment Method

Deploy **ONLY** via Railway CLI (`railway up`). **Never** connect Railway to your GitHub repository.

**❌ DO NOT:**
- Connect your Railway project to GitHub
- Use `railway up --github`
- Enable GitHub auto-deploy

**✅ ALWAYS:**
- Use `railway up` to deploy from your local machine
- Keep the git repo local; Railway stays isolated

---

## What Happens (Step-by-Step)

### 1. Pre-Flight Checks
```
✓ Verifying you're authenticated with Railway
✓ Verifying Rumi Deployments workspace is linked
✓ Checking for concurrent deployments (abort if running)
✓ Verifying git is clean (no uncommitted changes)
```

### 2. Deploy
```
✓ Starting: railway up
⏳ Building and uploading...
✓ Deployment complete
```

### 3. Post-Deploy Verification
```
✓ Confirming deployment status is SUCCESS
✓ Checking logs for crashes/restart loops
✓ Reporting deployment URL
```

---

## Common Scenarios

### Scenario 1: Fresh Setup (First Time Only)
```bash
railway login
railway project list
# If ahsan-javed not found:
railway project create ahsan-javed
railway project switch ahsan-javed
railway service create Invenza
railway whoami
railway status
/railway-deploy
```

### Scenario 2: Regular Deploy
```bash
/railway-deploy
```

### Scenario 3: Deployment Blocked
```
⚠️ Another deployment is already running
🛑 Wait for it to finish, then retry.
```

### Scenario 4: Deploy Failed
```
❌ Deployment FAILED
Check error logs shown above.
Fix the error, then run: /railway-deploy
```

---

## Error Scenarios & Recovery

**"Not authenticated"**
```bash
railway login
/railway-deploy
```

**"Project not found"**
```bash
railway project list
railway project create ahsan-javed
railway project switch ahsan-javed
/railway-deploy
```

**"Service not found"**
```bash
railway service list
railway service create Invenza
/railway-deploy
```

**"Wrong workspace"**
```bash
railway logout
railway login
railway whoami  # Should show: Rumi Deployments
/railway-deploy
```

**"railway: command not found"**
```bash
npm install -g @railway/cli
railway version
railway login
```

### ⚠️ "WARNING: This is a development server" (CRITICAL FIX)
**Issue:** App crashes repeatedly because the Flask development server is running in production.
**Symptom:** Logs show `WARNING: This is a development server. Do not use it in a production deployment.`
**Root Cause:** `src/web.py` or the startup script uses Flask's built-in `app.run()` instead of a production WSGI server.

**Fix:**
1. Install Gunicorn (production WSGI server):
   ```bash
   pip install gunicorn
   ```
2. Update the Railway `Procfile` to use Gunicorn (NOT Flask):
   ```
   web: gunicorn -w 4 -b 0.0.0.0:$PORT src.web:app
   ```
3. Update `requirements.txt`:
   ```bash
   pip freeze | grep gunicorn >> requirements.txt
   ```
4. Deploy:
   ```bash
   railway up
   ```
5. Verify logs show:
   ```
   [gunicorn] Starting gunicorn...
   [gunicorn] Listening on 0.0.0.0:8080
   ```
   (NOT Flask's "Running on http://...")

**Why This Matters:**
- Flask dev server: single-threaded, crashes under load, not production-ready
- Gunicorn: multi-worker, handles concurrent requests, production-grade stability
- Invenza experienced repeated crashes on May 8, 2026 until Gunicorn was added

---

## Rollback
```bash
railway deployment list
railway deploy <previous-build-id>
railway logs
```

---

## Safety Rules

**⛔ Never:**
- Connect Railway to GitHub
- Deploy if another deployment is in progress
- Hardcode secrets — use Railway dashboard environment variables
- Name a service after yourself — use your product/app name

**✅ Always:**
- Check `railway whoami` before first deploy
- Review logs after deployment: `railway logs`
- Deploy from the local machine via CLI only: `railway up`

---

## Useful Commands
```bash
railway whoami
railway project list
railway project switch ahsan-javed
railway service list
railway deployment list
railway logs
railway variables list
railway status
railway logout
```
