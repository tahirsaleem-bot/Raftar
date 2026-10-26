# Exit Interview Agent

**Live:** https://exit-interview-agent-production.up.railway.app
(Railway: workspace *People & Culture - Zeshan* -> project *Raftar Tahir* -> service *exit-interview-agent*,
volume mounted at `/data`.)

Watches the mailbox for People & Culture asking for an exit interview, helps you schedule
it, picks up the notetaker's summary afterwards, drafts the record in the house style, and
files it in Drive once you have read it.

Runs on Railway so it keeps working with the laptop shut. Everything you do is on the phone.

## How a case moves

| Stage | What happens | Who |
|---|---|---|
| **Needs scheduling** | Jawwad replies on a resignation thread asking for an exit interview. The agent reads the whole thread, pulls the leaver's name, work email and role out of the original resignation. | automatic |
| → | You check the address, pick a slot, tap **Send invite**. Calendar invite with a Meet link goes to the leaver and to Jawwad. | **you** |
| **Waiting** | The interview happens. | — |
| **Drafting** | Rumi / Fathom / Otter send their summary. The agent matches it to the case by name and timing, writes the record and renders the PDF. | automatic |
| **Ready for review** | You read the draft on your phone. Restricted sections and anything the record could not establish are flagged above the buttons. | **you** |
| → | Tap **File & send**: the PDF goes into the Drive folder and back to Jawwad as a reply on the original thread. | **you** |

Two steps are deliberately yours. Choosing when someone's exit interview happens is not a
machine's call, and these records carry harassment disclosures, named allegations and names
that reached us through a machine transcript — sending those unread would defeat the
restriction the document itself prints.

## Environment variables

| Variable | Needed | Notes |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_JSON` | yes | Contents of `credentials/google-oauth-client.json` |
| `GOOGLE_TOKEN_JSON` | yes | Contents of `credentials/google-token.json`, re-issued **with the `drive.file` scope** |
| `AGENT_TOKEN_SHA256` | yes | SHA-256 of the bearer token the scheduled routine uses. See **Who writes the record** below. |
| `ANTHROPIC_API_KEY` | no | Only if you want the app to draft by itself instead of the routine. A real `sk-ant-api…` key — subscription tokens are rejected here. |
| `APP_PIN` | yes | Anything you will remember on a phone |
| `HR_SENDERS` | no | Defaults to `jawwad.ali@taleemabad.com`. Comma-separated. |
| `DRIVE_FOLDER_ID` | no | Defaults to the "Exit Interviews" folder |
| `POLL_MINUTES` | no | 15 |
| `NOTES_WAIT_HOURS` | no | 48 — how long after the slot to keep looking for a summary |
| `DATA_DIR` | no | `/data`; attach a Railway volume there so cases survive a redeploy |

## Who writes the record

The drafting is done by a **scheduled Claude Code routine**, not by a metered API key. The
app only queues the work:

```
notetaker summary arrives
   -> case sits in "drafting"
   -> routine GET /agent/tasks      (leaver, sources, and the house-style rules)
   -> routine writes the record
   -> routine POST /agent/result    (app renders the PDF, case moves to review)
```

The rules travel with the task, so the routine and the app are always writing to the same
specification and the two produce the same document.

A subscription token (`sk-ant-oat…`) cannot be used as `ANTHROPIC_API_KEY` — it is issued
for Claude Code, and a server using it is rate limited almost immediately. The routine is
how the subscription gets used legitimately: the writing happens inside Claude Code, which
is what the subscription covers. Because the routine runs in the cloud, it works with the
laptop shut.

### Known limitation: the cloud routine cannot reach this app

The routine exists (`trig_01CQcEvpyXy88RujZpya98HE`, every 3 hours) and is correct, but the
cloud environment's egress proxy refuses the Railway host:

```
curl: (56) CONNECT tunnel failed, response 403
exit-interview-agent-production.up.railway.app:443 - connect_rejected
```

The environment allows outbound HTTPS only to hosts on its allowlist, and this one is not on
it. Setting `user_declared_urls` through the triggers API does not persist, so it needs to be
allowed for the environment itself.

**Until that is allowed, the drafting step runs from a Claude Code session instead** - the
same `/agent/tasks` and `/agent/result` endpoints, reachable from the laptop. Everything else
in the pipeline is unaffected and still runs with the laptop shut: picking up the request,
the invite, matching the notetaker summary, rendering, filing to Drive and the email.

Set it up once the app is deployed:

1. The bearer token is in `C:\Raftar\secrets\exit-interview-agent-token.txt`.
   Put its SHA-256 in `AGENT_TOKEN_SHA256` on Railway (never the token itself).
2. Create a routine that runs every few hours with roughly this prompt:

   > Fetch `https://exit-interview-agent-production.up.railway.app/agent/tasks` with header `Authorization: Bearer <token>`.
   > For each task, write the exit interview record following the `rules` field exactly,
   > shaped like `schemaHint`, using only the `sources`. Then POST
   > `{caseId, record}` to `https://<app>/agent/result` with the same header.
   > If there are no tasks, stop without doing anything.

3. Tahir gets a phone notification when a case reaches **Ready for review**.

## Re-authorising Google

The existing token can read Drive but not write to it. From `ai-agent-starter`:

```bash
node scripts/authorize.js
```

`drive.file` is already in that script's scope list. Approve in the browser, then copy the
new `credentials/google-token.json` into `GOOGLE_TOKEN_JSON` on Railway.

## Deploy

```bash
railway up
```

Attach a volume at `/data`, set the variables above, then open the URL on your phone and add
it to the home screen. `/api/status` shows which pieces are actually wired up — mailbox,
Drive folder, API key.

## Why the trigger looks the way it does

`hr@taleemabad.com` is the Markaz hiring mailbox; in six months it sent job applications,
offer letters and contract paperwork, and not one exit interview request. The real request
is a reply from the People & Culture manager on the leaver's own resignation thread, and it
names nobody — "pls set up an exit interview by understanding: her experience". The leaver's
name, work address, role and last working day are all in the resignation quoted underneath,
which is why the agent reads the whole thread rather than the one message that matched.

The keywords live in the Gmail query rather than being filtered afterwards, because a
sender-only search fills its result page with hiring traffic and pushes the one request that
matters off the end.

## Where the document design lives

The template and the writing rules are shared with the local `/exit-interview` skill, so a
record produced here and one produced by hand are the same document. The rules the model
writes to are in `src/ai.js` under `RECORD_RULES`; the full reasoning behind them is in the
skill's `references/house-style.md`.
