const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const CREDENTIALS_PATH = path.join(__dirname, '..', '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, '..', '..', 'credentials', 'google-token.json');

// ─── Build authenticated Docs client ─────────────────────────────────────────
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

function getDocsClient() {
  return google.docs({ version: 'v1', auth: getAuthClient() });
}

function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuthClient() });
}

// ─── Read a Google Doc by ID ──────────────────────────────────────────────────
async function readDoc(documentId) {
  try {
    const docs = getDocsClient();
    const res = await docs.documents.get({ documentId });

    const title = res.data.title;
    const text = extractText(res.data.body.content);

    logger.info(`[docs] Read document: "${title}" (${documentId})`);
    return { success: true, title, text, raw: res.data };
  } catch (err) {
    logger.error(`[docs] Failed to read doc ${documentId}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── List recent Google Docs from Drive ──────────────────────────────────────
async function listDocs(maxResults = 10) {
  try {
    const drive = getDriveClient();
    const res = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.document' and trashed=false",
      pageSize: maxResults,
      orderBy: 'modifiedTime desc',
      fields: 'files(id, name, modifiedTime, webViewLink)',
    });

    const docs = res.data.files || [];
    logger.info(`[docs] Found ${docs.length} document(s)`);
    return { success: true, docs };
  } catch (err) {
    logger.error('[docs] Failed to list docs:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Append text to an existing Google Doc ───────────────────────────────────
async function appendToDoc(documentId, text) {
  try {
    const docs = getDocsClient();

    // Get current end index
    const docRes = await docs.documents.get({ documentId });
    const endIndex = docRes.data.body.content.at(-1)?.endIndex - 1 || 1;

    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: endIndex },
              text: '\n' + text,
            },
          },
        ],
      },
    });

    logger.info(`[docs] Appended text to document ${documentId}`);
    return { success: true };
  } catch (err) {
    logger.error(`[docs] Failed to append to doc ${documentId}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── Helper: extract plain text from Doc content ─────────────────────────────
function extractText(content) {
  if (!content) return '';
  return content
    .filter(block => block.paragraph)
    .map(block =>
      (block.paragraph.elements || [])
        .map(el => el.textRun?.content || '')
        .join('')
    )
    .join('');
}

module.exports = { readDoc, listDocs, appendToDoc };
