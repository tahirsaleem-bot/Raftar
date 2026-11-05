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

// ─── Validate a hub meter reading ─────────────────────────────────────────────
// validateKM() above applies one flat KM_MIN..KM_MAX window. That is wrong for
// hub readings for two separate reasons, both confirmed against real sheet data
// on 2026-09-08:
//   * KM_MIN=1 would reject a trip hub's morning FPU, which is legitimately 0
//     (the driver resets the meter each morning — see the sheets-config notes).
//   * KM_MAX=500 would reject every reading an odometer hub ever sends
//     (G-13 = 106904, Tramri Chowk = 153299).
// So hub readings get their own bounds, chosen per meter type.
//
// `lastReading` is the hub's most recent recorded value, when known. For an
// odometer hub it is the only real defence against bad OCR: any absolute value
// in the 5-6 digit range looks plausible on its own, but a reading that moves
// backwards or leaps thousands of km in a day does not. Rejecting those is not
// a regression — the cell simply stays blank for manual entry, which is what
// already happens today — and it stops OCR noise corrupting a live sheet.
const ODO_MIN            = parseInt(process.env.ODO_MIN || '1000', 10);
const ODO_MAX            = parseInt(process.env.ODO_MAX || '1000000', 10);
// Rawalpindi odometer hubs (2026-10-26): overnight gaps seen 39-134 km, a day 41-58 km.
const ODO_MAX_DAILY_JUMP = parseInt(process.env.ODO_MAX_DAILY_JUMP || '500', 10);
const ODO_BASELINE_MAX_AGE_DAYS = parseInt(process.env.ODO_BASELINE_MAX_AGE_DAYS || '14', 10);
const TRIP_MAX           = parseFloat(process.env.TRIP_MAX || '9999.9');
// Longest plausible single day (LDO - FPU). Real days run 15-115 km.
const TRIP_MAX_DAY_KM    = parseFloat(process.env.TRIP_MAX_DAY_KM || '400');

// Whole days between a baseline reading and today; null if its date is unusable.
function baselineAgeDays(last) {
  if (!last || !last.iso) return null;
  const then = Date.parse(`${last.iso}T00:00:00Z`);
  if (isNaN(then)) return null;
  const today = new Date();
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, Math.round((todayUTC - then) / 86400000));
}

function validateHubKM(hubName, km, opts = {}) {
  const { meterTypeFor } = require('../config/hubGroups');
  const value = parseFloat(km);
  const meter = meterTypeFor(hubName);

  if (isNaN(value) || !Number.isFinite(value)) {
    return { valid: false, reason: `KM is not a finite number: "${km}"` };
  }

  if (meter === 'trip') {
    // 0 is valid and expected for a morning FPU.
    if (value < 0) {
      return { valid: false, reason: `trip reading ${value} is negative` };
    }
    // Not KM_MAX (500): Tramri Chowk's driver rarely resets trip A, so real
    // FPU values reach 579 / 651.3. The Alto trip meter itself tops out at
    // 9999.9; the per-day sanity check is LDO - FPU in the message handler.
    if (value > TRIP_MAX) {
      return { valid: false, reason: `trip reading ${value} exceeds TRIP_MAX (${TRIP_MAX}) for ${hubName}` };
    }
    return { valid: true, km: value, meter };
  }

  // odometer
  // Some days an odometer hub's driver sends the TRIP meter instead (Bahria
  // Ph-5 on 15-16 Oct: FPU 0, LDO 109.3). A trip-sized value is accepted as a
  // trip reading only when today's FPU is blank or itself trip-sized, so it is
  // never mixed with an odometer FPU in the same row. Rejected on 2026-10-26:
  // Bahria's driver typed 43 and it was thrown out as "outside 1000-1000000".
  const fpu = opts.fpu;
  if (value >= 0 && value < ODO_MIN && value <= TRIP_MAX && (fpu == null || fpu < ODO_MIN)) {
    return { valid: true, km: value, meter: 'trip', warning: `${hubName} is an odometer hub but sent a trip-meter reading (${value}) — written as a trip reading` };
  }
  if (value < ODO_MIN || value > ODO_MAX) {
    return { valid: false, reason: `odometer reading ${value} outside ${ODO_MIN}-${ODO_MAX} for ${hubName}` };
  }

  // The jump/backwards checks only mean anything against a RECENT baseline.
  // If a hub has been idle for months, a legitimate odometer is thousands of km
  // higher than its last recorded value, so comparing against it would reject
  // every genuine reading forever. Past ODO_BASELINE_MAX_AGE_DAYS we therefore
  // fall back to the absolute bounds alone and return a warning.
  const last = opts.lastReading;
  const ageDays = baselineAgeDays(last);
  if (last && Number.isFinite(last.km) && ageDays != null && ageDays <= ODO_BASELINE_MAX_AGE_DAYS) {
    // Allow for however many days actually elapsed, not just one.
    const allowedJump = ODO_MAX_DAILY_JUMP * Math.max(1, ageDays);
    if (value < last.km) {
      return { valid: false, reason: `odometer reading ${value} is BELOW last recorded ${last.km} (${last.date}) for ${hubName} — likely bad OCR` };
    }
    if (value > last.km + allowedJump) {
      return { valid: false, reason: `odometer reading ${value} jumps ${Math.round(value - last.km)} km over last recorded ${last.km} (${last.date}, ${ageDays}d ago) for ${hubName} — exceeds the ${allowedJump} km allowance; enter manually if the vehicle changed` };
    }
    return { valid: true, km: value, meter };
  }

  // No usable recent baseline — accepted on absolute bounds only, so flag it.
  return {
    valid: true,
    km: value,
    meter,
    warning: last
      ? `no recent baseline for ${hubName} (last reading ${last.km} is ${ageDays}d old) — checked against absolute bounds only`
      : `no previous reading recorded for ${hubName} — checked against absolute bounds only`,
  };
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

// ─── Validate an evening LDO against the same day's FPU (trip hubs) ──────────
// Total = LDO - FPU, so an LDO below the FPU or a 900 km "day" is a misread.
function validateTripDay(hubName, ldo, fpu) {
  if (fpu == null || !Number.isFinite(fpu)) return { valid: true };
  if (ldo < fpu) {
    return { valid: false, reason: `LDO ${ldo} is below today's FPU ${fpu} for ${hubName}` };
  }
  if (ldo - fpu > TRIP_MAX_DAY_KM) {
    return { valid: false, reason: `LDO ${ldo} - FPU ${fpu} = ${Math.round((ldo - fpu) * 10) / 10} km exceeds TRIP_MAX_DAY_KM (${TRIP_MAX_DAY_KM}) for ${hubName}` };
  }
  return { valid: true };
}

module.exports = { validateKM, validateHubKM, validateTripDay, getTeamMembers, isKnownMember };
