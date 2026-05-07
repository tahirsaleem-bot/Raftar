/**
 * Run this script ONCE to authorize Gmail + Google Calendar access.
 * It will open a browser window for you to log in with your Google account.
 * After approval, a token is saved to credentials/google-token.json
 * The agent will use this token automatically from then on.
 *
 * Usage: node scripts/authorize.js
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, '..', 'credentials', 'google-token.json');

// Scopes — read-only first; expand only when needed
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.readonly',
];

async function main() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('ERROR: credentials/google-oauth-client.json not found.');
    console.error('Download it from Google Cloud Console > APIs & Services > Credentials');
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('\n===== Google Authorization =====');
  console.log('Opening browser for Google login...');
  console.log('\nIf browser does not open, paste this URL manually:\n');
  console.log(authUrl);
  console.log('\n================================\n');

  // Try to open the browser automatically
  const { exec } = require('child_process');
  exec(`start "" "${authUrl}"`);

  // Start a local server to catch the callback
  const code = await waitForCode();

  const { tokens } = await oAuth2Client.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

  console.log('\nSUCCESS! Token saved to credentials/google-token.json');
  console.log('You will not need to run this script again unless the token expires.\n');
  process.exit(0);
}

function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const query = url.parse(req.url, true).query;
      if (query.code) {
        res.end('<h2>Authorization successful! You can close this tab.</h2>');
        server.close();
        resolve(query.code);
      } else if (query.error) {
        res.end(`<h2>Authorization failed: ${query.error}</h2>`);
        server.close();
        reject(new Error(query.error));
      }
    });

    server.listen(3001, () => {
      console.log('Waiting for Google authorization callback on http://localhost:3001 ...');
    });

    setTimeout(() => {
      server.close();
      reject(new Error('Timeout: no response after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}

main().catch(err => {
  console.error('Authorization failed:', err.message);
  process.exit(1);
});
