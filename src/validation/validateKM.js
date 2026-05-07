const config = require('../config');

// ─── Validate a KM value against business rules ───────────────────────────────
function validateKM(km) {
  const value = parseFloat(km);

  if (isNaN(value)) {
    return { valid: false, reason: `KM is not a number: "${km}"` };
  }

  if (!Number.isFinite(value)) {
    return { valid: false, reason: 'KM value is infinite or not finite' };
  }

  if (value < config.app.kmMin) {
    return { valid: false, reason: `KM ${value} is below minimum (${config.app.kmMin})` };
  }

  if (value > config.app.kmMax) {
    return { valid: false, reason: `KM ${value} exceeds maximum (${config.app.kmMax})` };
  }

  return { valid: true, km: value };
}

// ─── Master team member list ──────────────────────────────────────────────────
// Add all team members here exactly as their names appear in WhatsApp
// Format: { name: 'Display Name', phone: 'COUNTRY_CODE + 10-digit number' }
// Example: { name: 'Ali Hassan', phone: '923001234567' } (92 = Pakistan, 300... = actual number)
// This list is used by the daily checker (5PM) to detect missing submissions
const TEAM_MEMBERS = [
  { name: 'Coach 1', phone: '92XXXXXXXXXX' },
  { name: 'Coach 2', phone: '92XXXXXXXXXX' },
  { name: 'Coach 3', phone: '92XXXXXXXXXX' },
  // Add more coaches above — format: name as shown in WhatsApp, phone with country code
];

function getTeamMembers() {
  return TEAM_MEMBERS;
}

function isKnownMember(name) {
  if (TEAM_MEMBERS.length === 0) return true; // if list empty, allow all
  return TEAM_MEMBERS.some(m => m.name.toLowerCase() === name.toLowerCase());
}

module.exports = { validateKM, getTeamMembers, isKnownMember };
