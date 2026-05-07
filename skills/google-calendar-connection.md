# Skill: Google Calendar Integration (MCP + OAuth)

## Purpose
Connect your agent to Google Calendar via an MCP server using OAuth, then safely list events and (optionally) create events.

## Prerequisites
- You have access to a Google account.
- You can create a Google Cloud project (enable APIs, create OAuth consent + credentials).
- MCP server can be launched from your agent environment (Cursor + Claude Code / MCP-capable setup).
- A place to store secrets securely (do not commit OAuth client secrets or refresh tokens to git).

## Recommended MCP Server
- `@cocal/google-calendar-mcp` (TypeScript)

Alternative implementations exist; this skill documents the common OAuth + MCP workflow.

## Instructions
1. Create Google Cloud OAuth credentials
   1. In Google Cloud Console:
      - Enable "Google Calendar API"
      - Create OAuth 2.0 credentials
      - Application type: "Desktop app"
      - Download the OAuth client JSON (often named like `client_secret_*.json`)
   2. Record the required OAuth scopes you want:
      - Start with read-only scopes first when possible (least privilege).
      - Only add write scopes after you explicitly approve calendar-writing actions.

2. Set up the MCP server
   1. Install prerequisites: Node.js is typically required.
   2. Configure the MCP server entry in your Claude Code / MCP configuration file (the extension-specific location).
   3. Provide the OAuth client JSON to the MCP server via an environment variable (path to the JSON file).

3. First verification (read-only)
   1. Ask the agent to:
      - list available calendars
      - fetch the next N events from a given date range
   2. Confirm:
      - event times look correct (timezone)
      - you can see the right calendar(s)

4. Optional write workflow (guarded)
   1. Ask for explicit confirmation before creating/updating/deleting events.
   2. For every write action, require:
      - calendar name/id
      - start/end datetime + timezone
      - title/description
      - attendees (if any)
   3. After each successful write action:
      - update `memory.md` with what was learned (guardrails, timezone quirks, etc.)

## Common Mistakes
- [Mistake]: using overly broad OAuth scopes from day one.
  - Fix: start read-only; expand only when needed and approved.
- [Mistake]: committing `client_secret_*.json` or token files.
  - Fix: keep secrets in local user storage; never commit.
- [Mistake]: timezone confusion (especially around all-day events).
  - Fix: always state timezone in the request and verify returned event timestamps.

## Notes
Security: treat OAuth client secrets and refresh tokens as production credentials.

