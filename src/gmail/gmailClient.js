const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const CREDENTIALS_PATH = path.join(__dirname, '..', '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, '..', '..', 'credentials', 'google-token.json');

// ─── Build authenticated Gmail client ────────────────────────────────────────
function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) throw new Error('OAuth credentials not found. Run: node scripts/authorize.js');
  if (!fs.existsSync(TOKEN_PATH)) throw new Error('OAuth token not found. Run: node scripts/authorize.js');

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const { client_id, client_secret } = credentials.installed || credentials.web;

  const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  auth.setCredentials(token);
  return auth;
}

function getGmailClient() {
  return google.gmail({ version: 'v1', auth: getAuthClient() });
}

// ─── List recent emails (inbox) ───────────────────────────────────────────────
async function listEmails({ maxResults = 10, query = '' } = {}) {
  try {
    const gmail = getGmailClient();
    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: query,
    });

    const messages = res.data.messages || [];
    const emails = await Promise.all(messages.map(m => getEmail(m.id)));
    return { success: true, emails };
  } catch (err) {
    logger.error('[gmail] Failed to list emails:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Get a single email by ID ─────────────────────────────────────────────────
async function getEmail(messageId) {
  try {
    const gmail = getGmailClient();
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const headers = res.data.payload.headers;
    const get = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    return {
      id: messageId,
      subject: get('subject'),
      from: get('from'),
      to: get('to'),
      date: get('date'),
      snippet: res.data.snippet,
      body: extractBody(res.data.payload),
    };
  } catch (err) {
    logger.error(`[gmail] Failed to get email ${messageId}:`, err.message);
    return null;
  }
}

// ─── Send an email ────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, body }) {
  try {
    const gmail = getGmailClient();

    const raw = Buffer.from(
      `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
    ).toString('base64url');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    logger.info(`[gmail] Email sent to ${to} — messageId: ${res.data.id}`);
    return { success: true, messageId: res.data.id };
  } catch (err) {
    logger.error('[gmail] Failed to send email:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Search emails ────────────────────────────────────────────────────────────
async function searchEmails(query, maxResults = 20) {
  return listEmails({ maxResults, query });
}

// ─── Helper: extract plain text body from Gmail payload ──────────────────────
function extractBody(payload) {
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
    // fallback to html part
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
  }
  return '';
}

module.exports = { listEmails, getEmail, sendEmail, searchEmails };
