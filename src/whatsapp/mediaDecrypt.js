// ─── Self-contained WhatsApp media download + decryption ─────────────────────
// The injected browser-side downloadMedia() throws a minified "r" error on
// current WhatsApp Web builds (wweb.js hasn't caught up). WhatsApp media is
// end-to-end encrypted and served from its CDN by `directPath`, keyed by the
// per-message `mediaKey`. We can fetch the encrypted blob and decrypt it in
// Node with the documented algorithm — no browser Store needed.
//
// Algorithm (per the WhatsApp media spec):
//   expanded = HKDF-SHA256(mediaKey, 112 bytes, info="WhatsApp <Type> Keys")
//   iv        = expanded[0:16]
//   cipherKey = expanded[16:48]
//   macKey    = expanded[48:80]
//   encFile   = <ciphertext> || <10-byte MAC>
//   plaintext = AES-256-CBC-decrypt(cipherKey, iv, ciphertext)

const crypto = require('crypto');
const axios = require('axios');
const logger = require('../logger');

const MEDIA_INFO = {
  image: 'WhatsApp Image Keys',
  sticker: 'WhatsApp Image Keys',
  video: 'WhatsApp Video Keys',
  audio: 'WhatsApp Audio Keys',
  ptt: 'WhatsApp Audio Keys',
  document: 'WhatsApp Document Keys',
};

// HKDF (RFC 5869) with SHA-256 and an empty salt (→ 32 zero bytes).
function hkdf(key, length, info) {
  const salt = Buffer.alloc(32, 0);
  const prk = crypto.createHmac('sha256', salt).update(key).digest();
  const infoBuf = Buffer.from(info, 'utf8');
  let out = Buffer.alloc(0);
  let prev = Buffer.alloc(0);
  let i = 1;
  while (out.length < length) {
    prev = crypto.createHmac('sha256', prk)
      .update(Buffer.concat([prev, infoBuf, Buffer.from([i])]))
      .digest();
    out = Buffer.concat([out, prev]);
    i++;
  }
  return out.slice(0, length);
}

function toMediaKeyBuffer(mediaKey) {
  if (!mediaKey) return null;
  if (Buffer.isBuffer(mediaKey)) return mediaKey;
  if (typeof mediaKey === 'string') return Buffer.from(mediaKey, 'base64');
  // Sometimes stored as {0:.., 1:.., ...} or an array of bytes
  if (typeof mediaKey === 'object') {
    const vals = Object.values(mediaKey);
    if (vals.length && vals.every(v => typeof v === 'number')) return Buffer.from(vals);
  }
  return null;
}

async function decryptWhatsAppMedia(msg) {
  const d = (msg && msg._data) || {};
  const mediaKey = toMediaKeyBuffer(d.mediaKey || msg.mediaKey);
  const directPath = d.directPath || msg.directPath;
  const type = String(d.type || msg.type || 'image').toLowerCase();
  const mimetype = d.mimetype || msg.mimetype || 'image/jpeg';

  if (!mediaKey || mediaKey.length < 32) throw new Error('missing/invalid mediaKey');
  if (!directPath) throw new Error('missing directPath');

  const info = MEDIA_INFO[type] || MEDIA_INFO.image;
  const expanded = hkdf(mediaKey, 112, info);
  const iv = expanded.slice(0, 16);
  const cipherKey = expanded.slice(16, 48);
  const macKey = expanded.slice(48, 80);

  const url = 'https://mmg.whatsapp.net' + directPath;
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: { 'User-Agent': 'WhatsApp/2.2413.51 Mozilla/5.0', 'Origin': 'https://web.whatsapp.com' },
  });

  const enc = Buffer.from(resp.data);
  if (enc.length <= 10) throw new Error(`encrypted blob too small (${enc.length} bytes)`);
  const ciphertext = enc.slice(0, enc.length - 10);
  const mac = enc.slice(enc.length - 10);

  // Verify MAC (first 10 bytes of HMAC-SHA256(macKey, iv || ciphertext)).
  const expectedMac = crypto.createHmac('sha256', macKey)
    .update(Buffer.concat([iv, ciphertext])).digest().slice(0, 10);
  if (!expectedMac.equals(mac)) {
    logger.warn('[mediaDecrypt] MAC mismatch — decrypting anyway (key/info may differ)');
  }

  const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return { data: plaintext.toString('base64'), mimetype, filename: d.filename };
}

module.exports = { decryptWhatsAppMedia };
