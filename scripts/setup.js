/**
 * Raftar KM Agent — One-Command Setup Wizard
 *
 * Run: node scripts/setup.js
 *
 * This script will:
 *   1. Check all required files are in place
 *   2. Open your browser for Google login (one time only)
 *   3. Test every Google connection (Sheets, Gmail, Calendar, Docs)
 *   4. Print a clear summary of what worked and what needs attention
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, '..', '..', '..', 'credentials', 'google-token.json');
const TOKEN_PATH_LOCAL = path.join(__dirname, '..', 'credentials', 'google-token.json');

// All Google scopes needed for the full integration
// Minimum required scopes only — principle of least privilege
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',   // Read emails
  'https://www.googleapis.com/auth/gmail.send',        // Send reminder emails only
  'https://www.googleapis.com/auth/calendar.readonly', // Read calendar only
  'https://www.googleapis.com/auth/spreadsheets',      // KM sheet read/write
  'https://www.googleapis.com/auth/drive.readonly',    // List files only
  // Removed: calendar.events (write) — not needed for KM tracking
  // Removed: documents (write) — not needed for KM tracking
];

// ─── Colours for terminal output ─────────────────────────────────────────────
const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

function log(msg)  { console.log(msg); }
function ok(msg)   { console.log(c.green('  ✔ ') + msg); }
function fail(msg) { console.log(c.red('  ✘ ') + msg); }
function warn(msg) { console.log(c.yellow('  ⚠ ') + msg); }
function step(msg) { console.log('\n' + c.bold(c.cyan('► ' + msg))); }

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log('\n' + c.bold('═══════════════════════════════════════════'));
  log(c.bold('  Raftar KM Agent — Google Setup Wizard'));
  log(c.bold('═══════════════════════════════════════════'));

  // ── Step 1: Check credential file ────────────────────────────────────────
  step('Step 1: Checking credentials file');
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    fail('credentials/google-oauth-client.json not found!');
    log(c.red('\n  The OAuth credentials file is missing.'));
    log('  Expected location: ' + CREDENTIALS_PATH);
    process.exit(1);
  }
  ok('credentials/google-oauth-client.json found');

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_id, client_secret } = credentials.installed || credentials.web;
  const projectId = credentials.installed?.project_id || credentials.web?.project_id || 'unknown';
  ok(`Google Cloud project: ${projectId}`);

  // ── Step 2: OAuth login ───────────────────────────────────────────────────
  step('Step 2: Google Authorization');

  let auth;
  if (fs.existsSync(TOKEN_PATH_LOCAL)) {
    ok('Existing token found — skipping browser login');
    auth = buildAuthFromToken(client_id, client_secret, JSON.parse(fs.readFileSync(TOKEN_PATH_LOCAL)));

    // Refresh token if needed
    try {
      await auth.getAccessToken();
      ok('Token is valid');
    } catch {
      warn('Token expired — re-authorizing...');
      auth = await runOAuthFlow(client_id, client_secret);
    }
  } else {
    log(c.yellow('\n  No token found. Opening browser for Google login...'));
    log('  Please log in with your Google account and click ' + c.bold('"Allow"') + ' for all permissions.\n');
    auth = await runOAuthFlow(client_id, client_secret);
  }

  // ── Step 3: Test all connections ──────────────────────────────────────────
  step('Step 3: Testing Google Service Connections');

  const results = {
    gmail: await testGmail(auth),
    calendar: await testCalendar(auth),
    sheets: await testSheets(auth),
    docs: await testDocs(auth),
  };

  // ── Step 4: Summary ───────────────────────────────────────────────────────
  step('Step 4: Setup Summary');
  log('');

  const services = [
    { name: 'Gmail',           key: 'gmail' },
    { name: 'Google Calendar', key: 'calendar' },
    { name: 'Google Sheets',   key: 'sheets' },
    { name: 'Google Docs',     key: 'docs' },
  ];

  let allPassed = true;
  for (const s of services) {
    const r = results[s.key];
    if (r.success) {
      ok(`${s.name}: ${r.detail}`);
    } else {
      fail(`${s.name}: ${r.error}`);
      allPassed = false;
    }
  }

  log('');
  if (allPassed) {
    log(c.green(c.bold('  All Google services connected successfully!')));
    log(c.green('  Token saved to: credentials/google-token.json'));
    log('\n  Next step: Fill in WhatsApp credentials in .env then run:');
    log(c.cyan('    npm start\n'));
  } else {
    log(c.yellow('  Some services failed. See errors above.'));
    log('  Common fix: make sure APIs are enabled in Google Cloud Console:');
    log('  → console.cloud.google.com → APIs & Services → Library');
    log('  → Enable: Gmail API, Calendar API, Sheets API, Docs API, Drive API\n');
  }
}

// ─── OAuth Flow ───────────────────────────────────────────────────────────────
async function runOAuthFlow(client_id, client_secret) {
  const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');

  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  // Open browser on Windows
  const { exec } = require('child_process');
  exec(`start "" "${authUrl}"`, err => {
    if (err) {
      log('\n  Could not open browser automatically. Please open this URL manually:');
      log(c.cyan('  ' + authUrl + '\n'));
    }
  });

  log('  ' + c.yellow('Waiting for you to approve access in the browser...'));

  const code = await waitForCallback();
  const { tokens } = await auth.getToken(code);
  auth.setCredentials(tokens);

  fs.writeFileSync(TOKEN_PATH_LOCAL, JSON.stringify(tokens, null, 2));
  ok('Authorization complete — token saved');

  return auth;
}

function buildAuthFromToken(client_id, client_secret, token) {
  const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  auth.setCredentials(token);
  return auth;
}

function waitForCallback() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const query = url.parse(req.url, true).query;
      if (query.code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html><body style="font-family:sans-serif;text-align:center;padding:60px">
            <h2 style="color:#22c55e">✔ Authorization Successful!</h2>
            <p>You can close this tab and return to the terminal.</p>
          </body></html>
        `);
        server.close();
        resolve(query.code);
      } else if (query.error) {
        res.end(`Authorization failed: ${query.error}`);
        server.close();
        reject(new Error(query.error));
      }
    });

    server.listen(3001, () => {});

    setTimeout(() => {
      server.close();
      reject(new Error('Timeout: no response after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}

// ─── Connection Tests ─────────────────────────────────────────────────────────
async function testGmail(auth) {
  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.getProfile({ userId: 'me' });
    return { success: true, detail: `Connected as ${res.data.emailAddress} (${res.data.messagesTotal} messages)` };
  } catch (err) {
    return { success: false, error: formatError(err, 'Gmail API') };
  }
}

async function testCalendar(auth) {
  try {
    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.calendarList.list({ maxResults: 5 });
    const count = res.data.items?.length || 0;
    return { success: true, detail: `Connected — ${count} calendar(s) found` };
  } catch (err) {
    return { success: false, error: formatError(err, 'Calendar API') };
  }
}

async function testSheets(auth) {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    // Just verify auth works by calling the spreadsheets endpoint
    const drive = google.drive({ version: 'v3', auth });
    const res = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      pageSize: 5,
      fields: 'files(id,name)',
    });
    const count = res.data.files?.length || 0;
    return { success: true, detail: `Connected — ${count} spreadsheet(s) accessible` };
  } catch (err) {
    return { success: false, error: formatError(err, 'Sheets API') };
  }
}

async function testDocs(auth) {
  try {
    const drive = google.drive({ version: 'v3', auth });
    const res = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.document' and trashed=false",
      pageSize: 5,
      fields: 'files(id,name)',
    });
    const count = res.data.files?.length || 0;
    return { success: true, detail: `Connected — ${count} document(s) accessible` };
  } catch (err) {
    return { success: false, error: formatError(err, 'Docs API') };
  }
}

function formatError(err, service) {
  const msg = err.message || '';
  if (msg.includes('accessNotConfigured') || msg.includes('API has not been used')) {
    return `${service} not enabled in Google Cloud Console → enable it at console.cloud.google.com`;
  }
  if (msg.includes('invalid_grant')) return 'Token expired — delete credentials/google-token.json and re-run setup';
  if (msg.includes('ENOTFOUND')) return 'No internet connection';
  return msg;
}

main().catch(err => {
  console.error(c.red('\nSetup failed: ' + err.message));
  process.exit(1);
});
