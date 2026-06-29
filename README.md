# People Analyzer Logbook

A small web app to log work activities by voice throughout the 4-month cycle, then auto-build a People Analyzer self-assessment.

- **Voice → English:** browser Web Speech API (free) + Google Translate public endpoint (free, no key)
- **Storage:** one Google Sheet; each user gets their own tab, auto-created on first login
- **Privacy:** name + PIN login; each user sees only their own entries
- **App URL path:** `/pa`

## Run locally
```bash
npm install
# provide credentials either as files in ./credentials or as env vars (see below)
npm start            # -> http://localhost:3005/pa
```

## Environment variables
| Variable | What |
|---|---|
| `PA_LOGBOOK_SHEET_ID` | The Google Sheet ID used as the logbook |
| `PA_APP_SECRET` | Random secret for signing login tokens |
| `GOOGLE_OAUTH_CLIENT_JSON` | Contents of the Google OAuth client JSON |
| `GOOGLE_TOKEN_JSON` | Contents of the Google OAuth token JSON (must include refresh_token) |
| `GEMINI_API_KEY` | (optional) only needed for the AI "Generate" feature |
| `PORT` | Provided automatically by the host |

Locally you can instead drop `google-oauth-client.json` and `google-token.json` into `./credentials/`.

## Deploy (Railway / Render)
1. Push this folder to a GitHub repo.
2. Create a project from the repo. Build: auto (Node). Start: `npm start`.
3. Set the environment variables above (paste the JSON file contents into `GOOGLE_OAUTH_CLIENT_JSON` and `GOOGLE_TOKEN_JSON`).
4. Open `https://<your-url>/pa`.
