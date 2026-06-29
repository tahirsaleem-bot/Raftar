// Google OAuth client. Prefers env vars (cloud / Railway), falls back to local files.
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

function loadJSON(envVar, filePath) {
  if (process.env[envVar]) {
    try { return JSON.parse(process.env[envVar]); }
    catch (e) { throw new Error(`${envVar} is not valid JSON: ${e.message}`); }
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getAuth() {
  const credsDir = path.join(__dirname, '..', '..', 'credentials');
  const client = loadJSON('GOOGLE_OAUTH_CLIENT_JSON', path.join(credsDir, 'google-oauth-client.json'));
  const token = loadJSON('GOOGLE_TOKEN_JSON', path.join(credsDir, 'google-token.json'));
  const { client_id, client_secret } = client.installed || client.web;
  const a = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  a.setCredentials(token);
  return a;
}

module.exports = { getAuth };
