# Skill: Planning Document (Brick-by-Brick Execution)

## Purpose
Turn a high-level idea into an execution-ready project plan with clear phases, owners, checkpoints, and delivery criteria.

## When to Use
- User says "make a plan", "final plan", "roadmap", or "implementation steps".
- Project has multiple systems (for example: WhatsApp + Google Sheets + reminders).
- Team wants to build iteratively and avoid one-shot risky implementation.

## Inputs to Confirm First
- Problem statement (what is painful today).
- Business goal (what must improve).
- MVP scope (what is included/excluded).
- Constraints (tools, budget, security, compliance).
- Deadline or rollout target.

If anything is unclear, ask short clarification questions before finalizing.

## Output Format (Default)
Use this structure:
1. Problem
2. Goal
3. Scope (MVP in/out)
4. End-to-end workflow
5. Data model
6. Validation rules
7. Automation/reminder rules
8. Security and access controls
9. Monitoring and reliability
10. KPIs (success metrics)
11. Phased implementation plan
12. Future improvements
13. Risks and mitigations
14. Immediate next actions

## Planning Rules
- Keep steps actionable and testable.
- Define cut-off times, timezone, and duplicate-handling explicitly.
- Default to least privilege for credentials/scopes.
- Add a manual fallback path for failures.
- Include ownership per phase when possible.
- Prefer MVP first, then enhancements.

## Phase Template (Brick-by-Brick)
For each phase, include:
- Objective
- Deliverables
- Tasks
- Verification checks
- Exit criteria

Example phase labels:
- Phase 0: Setup and access
- Phase 1: Message ingestion
- Phase 2: Parsing and validation
- Phase 3: Sheet write pipeline
- Phase 4: Missing-report reminders
- Phase 5: Daily summary and manager updates

## Quality Checklist Before Finalizing
- [ ] Scope boundaries are explicit.
- [ ] Data fields are defined.
- [ ] Validation rules cover duplicates and invalid values.
- [ ] Reminder timing/escalation is defined.
- [ ] Security handling for secrets is documented.
- [ ] KPIs are measurable.
- [ ] Next 3 actions are concrete.

## Notes for This Project Type (KM Reporting)
- Suggested sheet columns: `Date`, `Team Member`, `KM`, `Source Message`, `Submitted At`, `Status`, `Reminder Sent`, `Notes`.
- Suggested KM validation range: `1-500` (adjust with business input).
- Suggested daily cutoff: define one timezone and use it consistently.
