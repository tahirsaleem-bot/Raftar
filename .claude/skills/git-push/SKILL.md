---
name: git-push
description: Safely push Ahsan Javed's code to GitHub. Runs the full safe git workflow — long-path fix, status check, pull, scoped stage, verify, commit, push — without touching any other student's files.
disable-model-invocation: true
argument-hint: "[brief description of what was changed]"
allowed-tools: Bash, Read, Glob
---

# git-push — Safe Push Skill for Ahsan Javed

Push Ahsan Javed's code to GitHub safely. This skill enforces all shared repo rules and handles common failure modes automatically.

**Usage:** `/git-push add login page and auth flow`

---

## Student Folder

**`ahsan-javed/`** — only files inside this folder will ever be staged or committed.

---

## Step-by-Step Instructions

### Step 1 — Enable Windows long-path support
```bash
git config core.longpaths true
```
Run every time. Prevents silent path-length failures that cause partial checkouts and mass deletions.

### Step 2 — Check current state
```bash
git status
```

**If modifications or deletions appear outside `ahsan-javed/`:**
Silently restore them — do not ask the student:
```bash
git restore -- <each foreign path>
```
Tell the student: "Cleaned up unrelated local changes from other student folders before pushing."

**If untracked files outside `ahsan-javed/` would block a pull:**
```bash
git clean -fd --exclude=ahsan-javed
```

### Step 3 — Pull latest from remote
```bash
git pull --rebase origin main
```
- Clean rebase or fast-forward → continue
- Merge conflict → **stop**. Show the conflicting file(s) clearly and ask the student what to keep. Never force through.

### Step 4 — Stage only this student's folder
```bash
git add ahsan-javed/
```

### Step 5 — Verify staged files
```bash
git diff --cached --name-only
```
Every line must start with `ahsan-javed/`.

**If any foreign path appears — Safe Recovery Protocol:**
```bash
git reset HEAD
git restore -- <each foreign path>
git add ahsan-javed/
git diff --cached --name-only
```
Tell the student what was cleaned. Then continue.

### Step 6 — Commit
Use `$ARGUMENTS` as the description. If no argument was given, read `git diff --cached` and write a descriptive message.

```bash
git commit -m "ahsan-javed: $ARGUMENTS

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### Step 7 — Push
```bash
git push origin main
```

### Step 8 — Confirm success
```bash
git status
```
Show the commit hash. Confirm working tree is clean and branch is up to date with `origin/main`.

---

## Error Handling

| Situation | Action |
|---|---|
| Modifications/deletions outside `ahsan-javed/` | `git restore -- <paths>`, continue |
| Untracked foreign files blocking pull | `git clean -fd --exclude=ahsan-javed`, continue |
| `git pull --rebase` conflict | Stop, show conflict, ask student |
| Foreign paths in staged files | Safe Recovery Protocol, then continue |
| No files changed | Tell student, stop |
| No argument given | Auto-generate message from `git diff --cached` |
| Pre-commit hook fails | Fix issue, make a NEW commit — never `--amend` or `--no-verify` |

---

## Rules — Never Break These

- **Only stage `ahsan-javed/`** — never `git add .` or `git add -A`
- **Always pull before pushing** — skipping causes conflicts for all other students
- **Never force push** — `git push origin main` only
- **Commit prefix must be `ahsan-javed:`**
- **Never commit** `.env`, `node_modules/`, `*.log`, `__pycache__/`
- **Never delete or rename** files outside `ahsan-javed/`
