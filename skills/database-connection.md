# Skill: Database / MCP Connection (Read-only)

## Purpose
Set up an MCP connection to a database (read-only) and verify it works with schema-first analysis.

## Prerequisites
- MCP-capable agent environment (e.g., Cursor + Claude Code extension)
- Read-only database credentials (least privilege)
- Target: document where credentials live and how to reconnect safely

## Instructions
1. Ask the agent to research the MCP setup procedure for your database type.
2. Provide the minimum required connection details (host, port, database name, username).
3. Use read-only access. If the agent asks for write access, refuse unless explicitly approved.
4. After connecting, run a minimal verification:
   - list schemas/tables (or equivalent)
   - confirm the connection has permission to read metadata
5. Update `docs/schema.md` by capturing the schema (tables, columns, types, relationships).
6. Only then proceed to data analysis using `skills/data-analysis.md`.

## Common Mistakes
- [Mistake]: skipping schema-first and assuming column meanings.
  - Fix: always capture the schema in `docs/schema.md` first.

## Notes
Security rule: treat credentials like a key. Never add them to versioned files.

