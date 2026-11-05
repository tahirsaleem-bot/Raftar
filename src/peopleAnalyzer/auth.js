// Simple PIN auth + signed tokens for the People Analyzer app.
const crypto = require('crypto');

function secret() {
  return process.env.PA_APP_SECRET || 'insecure-default-change-me';
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.pbkdf2Sync(String(pin), salt, 100000, 32, 'sha256').toString('hex');
  return salt + '$' + h;
}

function verifyPin(pin, stored) {
  const [salt, h] = String(stored || '').split('$');
  if (!salt || !h) return false;
  const calc = crypto.pbkdf2Sync(String(pin), salt, 100000, 32, 'sha256').toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(h, 'hex'));
  } catch (e) { return false; }
}

// token = base64url(name) + '.' + HMAC(name)
function makeToken(name) {
  const payload = Buffer.from(String(name), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return payload + '.' + sig;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  if (sig.length !== expect.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    return Buffer.from(payload, 'base64url').toString('utf8');
  } catch (e) { return null; }
}

module.exports = { hashPin, verifyPin, makeToken, verifyToken };
