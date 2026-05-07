/**
 * Test all Google + WhatsApp + Claude connections.
 * Run anytime to verify everything is still working.
 *
 * Usage: node scripts/test-connections.js
 */

require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const https = require('https');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, '..', 'credentials', 'google-token.json');

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

function ok(name, detail)   { console.log(c.green('  ✔ ') + c.bold(name) + (detail ? ': ' + detail : '')); }
function fail(name, detail) { console.log(c.red('  ✘ ') + c.bold(name) + (detail ? ': ' + detail : '')); }
function skip(name, reason) { console.log(c.yellow('  - ') + c.bold(name) + ': ' + reason); }

async function main() {
  console.log('\n' + c.bold('═══════════════════════════════════════'));
  console.log(c.bold('  Raftar KM Agent — Connection Tests'));
  console.log(c.bold('═══════════════════════════════════════\n'));

  const results = [];

  // ── Google OAuth token ────────────────────────────────────────────────────
  let auth = null;
  if (!fs.existsSync(TOKEN_PATH)) {
    fail('Google OAuth Token', 'Missing — run: node scripts/setup.js');
    results.push(false);
  } else {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    const { client_id, client_secret } = credentials.installed || credentials.web;
    auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
    auth.setCredentials(token);
    ok('Google OAuth Token', 'Found');
    results.push(true);
  }

  // ── Gmail ─────────────────────────────────────────────────────────────────
  if (auth) {
    try {
      const gmail = google.gmail({ version: 'v1', auth });
      const res = await gmail.users.getProfile({ userId: 'me' });
      ok('Gmail', res.data.emailAddress);
      results.push(true);
    } catch (err) {
      fail('Gmail', err.message);
      results.push(false);
    }
  } else skip('Gmail', 'Skipped — no token');

  // ── Google Calendar ───────────────────────────────────────────────────────
  if (auth) {
    try {
      const calendar = google.calendar({ version: 'v3', auth });
      const res = await calendar.calendarList.list({ maxResults: 1 });
      ok('Google Calendar', `${res.data.items?.length || 0} calendar(s)`);
      results.push(true);
    } catch (err) {
      fail('Google Calendar', err.message);
      results.push(false);
    }
  } else skip('Google Calendar', 'Skipped — no token');

  // ── Google Sheets ─────────────────────────────────────────────────────────
  if (auth) {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId || sheetId.startsWith('FILL')) {
      skip('Google Sheets', 'GOOGLE_SHEET_ID not set in .env');
    } else {
      try {
        const sheets = google.sheets({ version: 'v4', auth });
        const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: 'properties.title' });
        ok('Google Sheets', `"${res.data.properties.title}"`);
        results.push(true);
      } catch (err) {
        fail('Google Sheets', err.message);
        results.push(false);
      }
    }
  } else skip('Google Sheets', 'Skipped — no token');

  // ── Google Docs ───────────────────────────────────────────────────────────
  if (auth) {
    try {
      const drive = google.drive({ version: 'v3', auth });
      const res = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.document' and trashed=false",
        pageSize: 1,
        fields: 'files(id,name)',
      });
      ok('Google Docs', `${res.data.files?.length || 0} doc(s) accessible`);
      results.push(true);
    } catch (err) {
      fail('Google Docs', err.message);
      results.push(false);
    }
  } else skip('Google Docs', 'Skipped — no token');

  // ── WhatsApp (Meta API) ───────────────────────────────────────────────────
  const waToken = process.env.WHATSAPP_TOKEN;
  const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!waToken || waToken.startsWith('FILL')) {
    skip('WhatsApp', 'WHATSAPP_TOKEN not set in .env');
  } else {
    try {
      const data = await httpGet(`https://graph.facebook.com/v19.0/${waPhoneId}?access_token=${waToken}`);
      const parsed = JSON.parse(data);
      if (parsed.error) throw new Error(parsed.error.message);
      ok('WhatsApp', `Phone: ${parsed.display_phone_number || waPhoneId}`);
      results.push(true);
    } catch (err) {
      fail('WhatsApp', err.message);
      results.push(false);
    }
  }

  // ── Anthropic (Claude) ────────────────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey || anthropicKey.startsWith('FILL')) {
    skip('Anthropic (Claude)', 'ANTHROPIC_API_KEY not set in .env');
  } else {
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: anthropicKey });
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      });
      ok('Anthropic (Claude)', 'API key valid');
      results.push(true);
    } catch (err) {
      fail('Anthropic (Claude)', err.message);
      results.push(false);
    }
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  const passed = results.filter(Boolean).length;
  console.log('\n' + c.bold('─────────────────────────────────────'));
  console.log(c.bold(`  Results: ${passed}/${results.length} passed`));
  if (passed === results.length) {
    console.log(c.green(c.bold('  Everything is connected!')));
  } else {
    console.log(c.yellow('  Fix the errors above, then re-run this script.'));
  }
  console.log('');
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

main().catch(err => {
  console.error(c.red('Test runner failed: ' + err.message));
  process.exit(1);
});
