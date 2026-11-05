// Gmail API for tahir.saleem@niete.edu.pk (refresh token from GOOGLE_TOKEN_JSON). Refuses to send from any other account.
const cfg = require('./config');

let accessToken = null;
let expiresAt = 0;

function creds() {
  const c = JSON.parse(process.env.GOOGLE_OAUTH_CLIENT_JSON || '{}');
  const t = JSON.parse(process.env.GOOGLE_TOKEN_JSON || '{}');
  return { client: c.installed || c.web || c, refresh: t.refresh_token };
}

async function token() {
  if (accessToken && Date.now() < expiresAt - 60000) return accessToken;
  const { client, refresh } = creds();
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google token refresh failed: ' + (j.error_description || j.error));
  accessToken = j.access_token;
  expiresAt = Date.now() + j.expires_in * 1000;
  return accessToken;
}

async function api(p, opt = {}) {
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + p, {
    ...opt, headers: { Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json', ...(opt.headers || {}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Gmail ${p.split('?')[0]} ${r.status}: ${j.error?.message}`);
  return j;
}

let verified = false;
async function verifyAccount() {
  if (verified) return cfg.SENDER_EMAIL;
  const p = await api('profile');
  if (p.emailAddress !== cfg.SENDER_EMAIL) throw new Error('Gmail token belongs to ' + p.emailAddress + ', not ' + cfg.SENDER_EMAIL);
  verified = true;
  return p.emailAddress;
}

const b64 = s => Buffer.from(s, 'utf8').toString('base64');

async function send({ to, cc, subject, html, threadId, inReplyTo }) {
  if (process.env.DRY_RUN) throw new Error(`DRY_RUN: would send "${subject}" to ${to}`);
  await verifyAccount();
  const lines = [`From: ${cfg.SENDER_NAME} <${cfg.SENDER_EMAIL}>`, `To: ${to}`];
  if (cc) lines.push(`Cc: ${cc}`);
  lines.push(`Subject: =?UTF-8?B?${b64(subject)}?=`);
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`);
  lines.push('MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html));
  const body = { raw: Buffer.from(lines.join('\r\n')).toString('base64url') };
  if (threadId) body.threadId = threadId;
  const res = await api('messages/send', { method: 'POST', body: JSON.stringify(body) });
  const meta = await getMessage(res.id);
  return { id: res.id, threadId: res.threadId, messageIdHeader: headers(meta)['message-id'] };
}

const headers = m => Object.fromEntries((m.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value]));
function walk(p, out = []) { if (!p) return out; out.push(p); (p.parts || []).forEach(x => walk(x, out)); return out; }

function textOf(m) {
  const parts = walk(m.payload);
  const plain = parts.find(p => p.mimeType === 'text/plain' && p.body?.data);
  if (plain) return Buffer.from(plain.body.data, 'base64').toString('utf8');
  const html = parts.find(p => p.mimeType === 'text/html' && p.body?.data);
  if (html) {
    return Buffer.from(html.body.data, 'base64').toString('utf8')
      .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  }
  return m.snippet || '';
}

// Drop the quoted history below a reply ("On ... wrote:", "> ..." lines, forwarded headers).
function stripQuoted(t) {
  const i = t.search(/\n\s*On .{5,160}wrote:|\n-{2,} ?Forwarded message|\n>|\n_{5,}/);
  return (i > 0 ? t.slice(0, i) : t).trim();
}

const getThread = id => api(`threads/${id}?format=full`);
const getMessage = (id, format = 'metadata') =>
  api(`messages/${id}?format=${format}&metadataHeaders=Message-ID&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`);

// Images and PDFs attached to a message, as base64 (standard alphabet) for Claude. Others are listed but skipped.
async function attachments(m, maxN = 6) {
  const out = [];
  for (const p of walk(m.payload)) {
    if (!p.filename || !p.body?.attachmentId) continue;
    let mt = (p.mimeType || '').toLowerCase();
    if (/jpe?g/.test(mt)) mt = 'image/jpeg';
    const usable = /^(image\/(png|jpeg|gif|webp)|application\/pdf)$/.test(mt);
    if (!usable || p.body.size > 4.5e6 || out.filter(a => a.data).length >= maxN) { out.push({ filename: p.filename, mimeType: mt, skipped: true }); continue; }
    const a = await api(`messages/${m.id}/attachments/${p.body.attachmentId}`);
    out.push({ filename: p.filename, mimeType: mt, data: a.data.replace(/-/g, '+').replace(/_/g, '/') });
  }
  return out;
}

// One attachment by filename (for the routine to download).
async function attachmentFile(msgId, filename) {
  const m = await api(`messages/${msgId}?format=full`);
  const p = walk(m.payload).find(x => x.filename === filename && x.body?.attachmentId);
  if (!p) throw new Error('Attachment not found');
  const a = await api(`messages/${msgId}/attachments/${p.body.attachmentId}`);
  return { mime: p.mimeType, buf: Buffer.from(a.data, 'base64url') };
}

async function search(q, max = 10) {
  const r = await api(`messages?maxResults=${max}&q=${encodeURIComponent(q)}`);
  return r.messages || [];
}

const isMe = from => (from || '').toLowerCase().includes(cfg.SENDER_EMAIL);
const isBounce = from => /mailer-daemon|postmaster/i.test(from || '');

module.exports = { send, getThread, getMessage, headers, textOf, stripQuoted, attachments, attachmentFile, search, verifyAccount, isMe, isBounce };
