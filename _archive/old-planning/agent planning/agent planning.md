# Agent Planning

## 1) Problem
The team shares daily visit kilometers (KM) in a WhatsApp group. Right now, KM data is entered manually into Google Sheets, which is slow and can cause mistakes.

## 2) Goal
Build an automation system that can:
- Read KM messages from the WhatsApp logistics group.
- Extract team member name, KM value, and submission timestamp.
- Add structured data directly to Google Sheets.
- Detect missing daily reports.
- Send automatic reminder follow-ups (email or message).

## 3) Scope (MVP)
### In Scope
- Message monitoring from the target group.
- KM extraction and validation.
- Google Sheet row creation/update.
- Missing submission detection at a defined cut-off time.
- Reminder sending and delivery log.

### Out of Scope (for MVP)
- Advanced dashboards and BI.
- Complex natural language support for every message format.
- Full manager portal UI.

## 4) End-to-End Workflow
1. System listens to new group messages.
2. Parser identifies whether a message is a KM report.
3. Extract:
   - Team member
   - KM value
   - Date and time
4. Validate rules (numeric value, range, duplicate, member match).
5. Write valid entry into Google Sheet.
6. At daily cut-off time, compare expected team list vs submitted list.
7. Send reminders to missing members.
8. Save logs for processed, skipped, failed, and reminded records.

## 5) Data Model (Google Sheet)
Recommended columns:
- `Date`
- `Team Member`
- `KM`
- `Source Message`
- `Submitted At`
- `Status` (`submitted`, `missing`, `invalid`)
- `Reminder Sent` (`yes`, `no`)
- `Notes/Error`

## 6) Validation Rules
- KM must be numeric.
- KM range default: `1-500` (adjust after business confirmation).
- One final submission per member per day (define if first wins or latest wins).
- Duplicate messages must not create duplicate records.
- Unknown member names go to review queue/status `invalid`.

## 7) Reminder Rules
- Define one timezone for all checks.
- Define cut-off time (example: `7:00 PM` local timezone).
- Send first reminder at cut-off.
- Optional second reminder after a delay (example: 2 hours).
- Stop reminders once submission is received.
- Optional escalation to manager for unresolved missing reports.

## 8) Security and Access Controls
- Use least-privilege OAuth/API scopes.
- Store credentials/secrets outside git.
- Restrict sheet edit access to the automation identity.
- Keep audit log for every write and reminder action.

## 9) Monitoring and Reliability
- Daily health status (success/fail count).
- Retry policy for temporary API failures.
- Error log with root cause and retry outcome.
- Manual fallback process if automation is down.

## 10) Success Metrics (KPIs)
- Manual data-entry time reduction (%).
- Daily submission completeness rate.
- Data error rate.
- Reminder response rate.

## 11) Phased Implementation (Brick by Brick)
### Phase 0: Setup
Objective: prepare all integrations and config.
- Deliverables: access, sheet schema, secrets, member master list.
- Exit criteria: test write to sheet works.

### Phase 1: Message Intake
Objective: capture WhatsApp messages reliably.
- Deliverables: message capture pipeline.
- Exit criteria: incoming messages are logged.

### Phase 2: Parsing + Validation
Objective: convert free text to structured KM records.
- Deliverables: parser + validation rules.
- Exit criteria: sample messages parsed with expected accuracy.

### Phase 3: Sheet Write Pipeline
Objective: persist clean records to Google Sheets.
- Deliverables: row write/update logic + duplicate protection.
- Exit criteria: no duplicate rows on repeated inputs.

### Phase 4: Missing Report Detection + Reminders
Objective: enforce submission compliance daily.
- Deliverables: daily checker + reminder sender.
- Exit criteria: missing members are correctly identified and notified.

### Phase 5: Reporting and Improvements
Objective: improve visibility and management updates.
- Deliverables: daily summary and monthly totals.
- Exit criteria: manager-ready summary generated automatically.

## 12) Risks and Mitigation
- WhatsApp integration fragility -> define fallback submission channel.
- Parsing ambiguity -> enforce simple message template gradually.
- API quota/timeouts -> implement retries and backoff.
- Credential issues -> rotate and monitor secrets securely.

## 13) Future Improvements
- Daily summary report to managers.
- Monthly KM totals by person and team.
- Trend charts (submission rate, KM totals, missing reports).
- Exception alerts for abnormal KM patterns.

## 14) Immediate Next 3 Actions
1. Finalize cut-off time, timezone, and member master list.
2. Confirm WhatsApp integration method for MVP.
3. Implement Phase 0 + Phase 1 with test data and verification.
