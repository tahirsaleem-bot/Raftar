// Gmail, Calendar and Drive for tahir.saleem@niete.edu.pk, all off one refresh token.
// Plain fetch against the REST APIs rather than the googleapis package - the surface we
// need is small, and it keeps the container light.
const cfg = require('./config');

// Header the app puts on every message it sends, and refuses to act on when it reads one.
const AGENT_HEADER = 'X-Raftar-Agent';

let accessToken = null;
let expiresAt = 0;

// Strip a byte-order mark before parsing. These two values are pasted in from files, and
// on Windows a UTF-8 BOM rides along invisibly - JSON.parse then fails on a character you
// cannot see in the Railway dashboard, which is a miserable thing to debug.
const parseJson = (raw, what) => {
  try { return JSON.parse(String(raw || '{}').replace(/^﻿/, '').trim()); }
  catch (e) { throw new Error(`${what} is not valid JSON: ${e.message}`); }
};

function creds() {
  const c = parseJson(process.env.GOOGLE_OAUTH_CLIENT_JSON, 'GOOGLE_OAUTH_CLIENT_JSON');
  const t = parseJson(process.env.GOOGLE_TOKEN_JSON, 'GOOGLE_TOKEN_JSON');
  return { client: c.installed || c.web || c, refresh: t.refresh_token };
}

async function token() {
  if (accessToken && Date.now() < expiresAt - 60000) return accessToken;
  const { client, refresh } = creds();
  if (!refresh) throw new Error('GOOGLE_TOKEN_JSON is missing a refresh_token');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.client_id, client_secret: client.client_secret,
      refresh_token: refresh, grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google token refresh failed: ' + (j.error_description || j.error));
  accessToken = j.access_token;
  expiresAt = Date.now() + j.expires_in * 1000;
  return accessToken;
}

async function api(url, opts = {}) {
  const t = await token();
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: 'Bearer ' + t, ...(opts.headers || {}) },
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`${opts.method || 'GET'} ${url.split('?')[0]} -> ${r.status}: ${body.slice(0, 400)}`);
  }
  return r.status === 204 ? null : r.json();
}

// ---------------------------------------------------------------- identity

async function profile() {
  const p = await api('https://gmail.googleapis.com/gmail/v1/users/me/profile');
  return p.emailAddress;
}

// Guard against the token being swapped for a different mailbox: everything this agent
// does (reading HR requests, sending records) is wrong if it runs as someone else.
async function assertSender() {
  const who = await profile();
  if (who.toLowerCase() !== cfg.SENDER_EMAIL.toLowerCase()) {
    throw new Error(`Token belongs to ${who}, expected ${cfg.SENDER_EMAIL}`);
  }
  return who;
}

// ---------------------------------------------------------------- gmail

async function search(query, max = 25) {
  const u = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(query)}`;
  const j = await api(u);
  return j.messages || [];
}

function headerMap(payload) {
  const h = {};
  (payload.headers || []).forEach(x => { h[x.name.toLowerCase()] = x.value; });
  return h;
}

function collectParts(part, out = []) {
  if (!part) return out;
  if (part.body && part.body.data) out.push({ mime: part.mimeType, data: part.body.data });
  (part.parts || []).forEach(p => collectParts(p, out));
  return out;
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function message(id) {
  const m = await api(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
  const h = headerMap(m.payload);
  const parts = collectParts(m.payload);
  const dec = p => Buffer.from(p.data, 'base64').toString('utf8');
  const plain = parts.find(p => p.mime === 'text/plain');
  const html = parts.find(p => p.mime === 'text/html');
  // Notetakers put the useful content in the HTML part and only a stub in text/plain,
  // so prefer plain text only when it actually carries the body.
  let body = plain ? dec(plain).trim() : '';
  if (body.length < 300 && html) body = htmlToText(dec(html));
  return {
    id, threadId: m.threadId,
    from: h.from || '', to: h.to || '', subject: h.subject || '',
    date: h.date || '', messageId: h['message-id'] || '',
    // Set when this app sent the message; the trigger uses it to ignore its own mail.
    fromAgent: !!h[AGENT_HEADER.toLowerCase()],
    body,
  };
}

// The request to run an exit interview arrives as a reply on the leaver's own resignation
// thread ("@Tahir pls set up an exit interview..."), and that reply does not name them -
// the name and work address are in the first message. So we always read the whole thread.
async function thread(threadId) {
  const t = await api(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`);
  return (t.messages || []).map(m => {
    const h = headerMap(m.payload);
    const parts = collectParts(m.payload);
    const dec = p => Buffer.from(p.data, 'base64').toString('utf8');
    const plain = parts.find(p => p.mime === 'text/plain');
    const html = parts.find(p => p.mime === 'text/html');
    let body = plain ? dec(plain).trim() : '';
    if (body.length < 300 && html) body = htmlToText(dec(html));
    return {
      id: m.id, from: h.from || '', to: h.to || '', cc: h.cc || '',
      subject: h.subject || '', date: h.date || '', body,
    };
  });
}

function b64url(s) {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Sends a reply on an existing thread when threadId/inReplyTo are supplied, so the record
// lands under the original HR request rather than starting a new conversation.
async function send({ to, cc, subject, html, threadId, inReplyTo, attachments = [] }) {
  await assertSender();
  const boundary = 'eia_' + Math.random().toString(36).slice(2);
  const headers = [
    `From: ${cfg.SENDER_NAME} <${cfg.SENDER_EMAIL}>`,
    `To: ${to}`,
    // Stamps everything this app sends. The nudges and alerts go to Tahir's own mailbox
    // and say things like "Exit interview to schedule", which the trigger read as a fresh
    // resignation - so the app opened a case, which sent another nudge, which opened
    // another case. Marking our own mail is the general fix; matching on subjects would
    // only hold until the next message type is added.
    `${AGENT_HEADER}: exit-interview`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${subject}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    inReplyTo ? `References: ${inReplyTo}` : null,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].filter(Boolean).join('\r\n');

  let body = `${headers}\r\n\r\n--${boundary}\r\n`
    + 'Content-Type: text/html; charset="UTF-8"\r\n'
    + 'Content-Transfer-Encoding: 7bit\r\n\r\n'
    + html + '\r\n';

  for (const a of attachments) {
    body += `--${boundary}\r\n`
      + `Content-Type: ${a.mime}; name="${a.filename}"\r\n`
      + `Content-Disposition: attachment; filename="${a.filename}"\r\n`
      + 'Content-Transfer-Encoding: base64\r\n\r\n'
      + a.content.toString('base64').replace(/(.{76})/g, '$1\r\n') + '\r\n';
  }
  body += `--${boundary}--`;

  return api('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: b64url(body), ...(threadId ? { threadId } : {}) }),
  });
}

// ---------------------------------------------------------------- calendar

// sendUpdates=all is what actually delivers the invite to the leaver and HR; without it
// the event is created silently and nobody is told.
async function createInvite({ summary, description, startIso, endIso, attendees }) {
  await assertSender();
  const u = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
          + '?sendUpdates=all&conferenceDataVersion=1';
  return api(u, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary, description,
      start: { dateTime: startIso, timeZone: 'Asia/Karachi' },
      end: { dateTime: endIso, timeZone: 'Asia/Karachi' },
      attendees: attendees.map(email => ({ email })),
      reminders: { useDefault: true },
      conferenceData: {
        createRequest: { requestId: 'eia-' + Date.now(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
    }),
  });
}

// ---------------------------------------------------------------- drive

async function uploadFile(filename, buffer, mime, folderId) {
  await assertSender();
  const meta = { name: filename, mimeType: mime, ...(folderId ? { parents: [folderId] } : {}) };
  const boundary = 'drv_' + Math.random().toString(36).slice(2);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const j = await api(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true',
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
  );
  return j;
}

const uploadPdf = (filename, buffer, folderId) =>
  uploadFile(filename, buffer, 'application/pdf', folderId);

// Give a group read access to a file we just created, so everyone on the HR alias can
// open the record from the link instead of having to request access from Tahir.
// The drive.file scope covers this: it allows managing files the app itself created.
// hr@ is a Google Group, but the same address can also resolve as a user depending on how
// it is set up, so try group first and fall back rather than failing the whole publish.
async function shareWithReader(fileId, email) {
  const body = role => JSON.stringify({ role: 'reader', type: role, emailAddress: email });
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`
            + '?sendNotificationEmail=false&supportsAllDrives=true';
  for (const type of ['group', 'user']) {
    try {
      await api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(type) });
      return type;
    } catch (e) { if (type === 'user') throw e; }
  }
}

// Everything filed in the Exit Interviews folder, newest first. This is what the register
// is built from rather than the case store: the folder is the thing People & Culture
// actually keep, it holds the interviews done before this app existed, and a record that
// was filed is a record that happened - a case can sit in any state and prove nothing.
//
// The drive.file scope only returns files this app created, which is why the older records
// had to be uploaded through it rather than dropped in the folder by hand.
async function listFolder(folderId) {
  const u = 'https://www.googleapis.com/drive/v3/files'
    + `?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}`
    + '&fields=files(id,name,createdTime,size,webViewLink)&orderBy=createdTime desc'
    + '&pageSize=200&supportsAllDrives=true';
  const j = await api(u);
  return j.files || [];
}

// Surfaces a misconfigured folder id or a missing drive.file scope at startup, where it is
// obvious, instead of at the moment a finished record is being filed.
async function checkDrive() {
  if (!cfg.DRIVE_FOLDER_ID) return { ok: false, reason: 'DRIVE_FOLDER_ID not set' };
  try {
    const f = await api(`https://www.googleapis.com/drive/v3/files/${cfg.DRIVE_FOLDER_ID}`
      + '?fields=id,name,mimeType&supportsAllDrives=true');
    if (f.mimeType !== 'application/vnd.google-apps.folder') return { ok: false, reason: 'that id is not a folder' };
    return { ok: true, name: f.name };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = {
  AGENT_HEADER,
  token, profile, assertSender,
  search, message, thread, send,
  createInvite,
  uploadFile, uploadPdf, shareWithReader, checkDrive, listFolder,
};
