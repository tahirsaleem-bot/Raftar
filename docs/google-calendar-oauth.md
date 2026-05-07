# Google Calendar OAuth (Reference)

Store the *non-secret* details here (scopes, which account, token lifecycle notes).
Do not paste OAuth client secrets into this repo.

## Setup checklist
- OAuth credential created with application type: `Desktop app`
- Calendar API enabled in Google Cloud project
- Scopes chosen (least privilege first)

## Suggested scopes
- Read-only (recommended to start): `calendar.readonly`
- Write (request explicitly later): `calendar.events`

## Verification notes
- Confirm timezone handling for event start/end datetimes
- Confirm the agent can list calendars + events before writing anything

