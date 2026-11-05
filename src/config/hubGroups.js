// ─── Hub → WhatsApp Group Mapping ────────────────────────────────────────────
// hubName must match the "Proposed Hub Locations" column in the Logistics sheet.
//
// `meter` — classified from real sheet history on 2026-09-08, not guessed:
//   'trip'     FPU column is 0 every day (driver resets the meter each morning),
//              so daily values are small: 24.6 / 73.5 / 80.2 / 126.1.
//   'odometer' FPU is a real running total, so values are 5-6 digits:
//              G-13 = 106904, Tramri Chowk = 153299 (Sep 2026).
// Re-checked 2026-10-20: every hub, G-13 and Tramri Chowk included, now logs
// the Alto TRIP meter. As odometer hubs, every real reading they sent was
// rejected by ODO_MIN (e.g. Tramri Chowk "110" / "299.5").
//
// hubName set by Tahir on 2026-09-08: G-13 (not 'E-9 AHQ') and Scheme 3 (not
// 'lane 6'). The old names were dead — sheet history shows G-13 and Scheme 3
// with daily rows through 09-07-2026, while 'E-9 AHQ' stops in May 2026 and
// 'lane 6' in Feb 2026. addDailyRows builds rows from this list, so the wrong
// names here meant the agent created rows no lookup could ever match.
// This drives validateHubKM() — a flat KM_MAX is meaningless for an odometer
// hub and would reject every genuine reading it ever sends.

const HUB_GROUPS = [
  {
    hubName: 'G-13',
    groupId: '120363322453549511@g.us', // E-9 - Bara Kahu Niete
    // Was an odometer hub in Sep 2026 (J 105531 -> 106904). Re-checked 2026-10-20:
    // October rows are trip values (0 -> 53 / 62.3 / 65.1) and the photos show
    // the Alto trip meter, e.g. "B 0.0 km".
    meter: 'trip',
  },
  {
    hubName: 'Scheme 3',
    groupId: '120363302269376354@g.us', // Scheme 3 - Nilore Niete
    meter: 'trip', // J=0 every day, K=76.2-103
  },
  {
    hubName: 'Khawaja corporation',
    groupId: '120363303640759505@g.us', // Khwaja Corporation - Sihala Niete
    meter: 'trip', // J=0, K=25.8-73.5
  },
  {
    hubName: 'Tramri Chowk',
    groupId: '120363302485844145@g.us', // Taramri Chowk - Sihala Niete
    // Was an odometer hub in Sep 2026 (J=153299). Re-checked 2026-10-20: the
    // photos show the Alto trip meter "A", which this driver often does NOT
    // reset, so FPU is a trip value that can be large (311.2, 579, 651.3) and
    // Total = LDO - FPU stays a normal day (78-102 km).
    meter: 'trip',
  },
  {
    hubName: 'H-13 Tarnol',
    groupId: '120363303936357672@g.us', // H-13 - Tarnol Niete
    meter: 'trip', // J=0, K=30.5-61.6
  },
  {
    hubName: 'I-10 Tarnol',
    groupId: '120363302781594420@g.us', // I-10 - Tarnol Niete
    meter: 'trip', // J=0, K=24.6-51.5
  },
  {
    hubName: 'Misrial Road',
    groupId: '120363350174748616@g.us', // Misriyal road - I-14 - Tarnol Niete
    meter: 'trip', // J=0, K=41.5-80.2
  },
];

// ─── Rawalpindi hubs ("Rawalpindi Dedicated Fleet" tab) ──────────────────────
// Added 2026-10-26 at Tahir's request. Group ids verified against WhatsApp's own
// chat list (/api/group-names) — the groups were renamed, the ids were not.
// hubName must match column E of the Rawalpindi tab exactly.
// meter from that tab's history: Gulraiz + Bahria log a real ODOMETER
// (41477 -> 41518, 118316 -> 118364); Ghauri town + DHA log the trip meter.
const RWP_GROUPS = [
  { hubName: 'Gulraiz car chowk', groupId: '120363421054812106@g.us', meter: 'odometer', fleet: 'rawalpindi' }, // Niete Gulraiz car chowk - Rawalpindi side
  { hubName: 'Bahria Ph-5',       groupId: '120363405007279347@g.us', meter: 'odometer', fleet: 'rawalpindi' }, // Niete Bahria phase 5 - For Rawalpindi
  { hubName: 'Ghauri town',       groupId: '120363408109920568@g.us', meter: 'trip',     fleet: 'rawalpindi' }, // Ghauri town ph-5 - For Rawalpindi (was "Niete I-10 - For Rawalpindi")
  { hubName: 'DHA',               groupId: '120363426193159879@g.us', meter: 'trip',     fleet: 'rawalpindi' }, // DHA - Niete(Rawalpindi)
];
// Still NOT monitored (old/other Rawalpindi groups):
// Faizabad -i10 - Rawalpindi (NIETE)  : 120363420278137966@g.us
// Bahria phase 5 - Rawalpindi (NIETE) : 120363404200028541@g.us
// Niete RWP                           : 120363401612936855@g.us

// One sheet tab per fleet. Column indexes are 0-based (A = 0).
const FLEETS = {
  islamabad: {
    label: 'Islamabad',
    tab: process.env.LOGISTICS_SHEET_TAB || 'Niete Dedicated Fleet',
    width: 12, // A..L
    col: { srNo: 0, date: 1, region: 2, coaches: 3, hub: 4, driver: 5, vehicle: 6, signIn: 7, signOut: 8, fpu: 9, ldo: 10, total: 11 },
    header: ['Sr No', 'Date', 'Regions', 'Respective Coaches', 'Proposed Hub Locations', 'Driver', 'Vehicle', 'Sign In', 'Sign Out', 'FPU Reading', 'LDO Reading', 'Total Reading'],
    hubs: () => HUB_GROUPS,
    regionMap: { 'G-13': 'B.K', 'Scheme 3': 'Nilore', 'Khawaja corporation': 'Sihala', 'Tramri Chowk': 'Sihala', 'H-13 Tarnol': 'Tarnol', 'I-10 Tarnol': 'Tarnol', 'Misrial Road': 'Tarnol' },
    // BusCaro invoice terms, from "Invoice - NIETE September 26" (BUC-NIETE-Isb-24):
    // per route  Fixed 52,500 + Variable Σ(km ÷ 12 × that day's petrol rate)
    invoice: {
      provider: 'BusCaro Technologies Pvt Ltd', account: 'Orenda Private Limited',
      fixed: 52500, kmPerLitre: 12, vehicleType: 'Hatchback (AC)',
      names: {
        'G-13': 'G-13 - Bara Kahu Niete',
        'Scheme 3': 'Scheme 3 - Nilore Niete',
        'Khawaja corporation': 'Khwaja Corporation - Sihala Niete',
        'Tramri Chowk': 'Taramri Chowk - Sanam Chowk - Sihala Niete',
        'H-13 Tarnol': 'H-13 - Tarnol Niete',
        'I-10 Tarnol': 'I-10 - G-8 - Tarnol Niete',
        'Misrial Road': 'Misriyal Road - H-13 -Zone Tarnol',
      },
    },
  },
  rawalpindi: {
    label: 'Rawalpindi',
    tab: 'Rawalpindi Dedicated Fleet',
    // Monitoring began 2026-10-26 mid-morning: that morning's photos were never
    // recorded, so the night-time "off" marker must not judge that day.
    offMarkFrom: '2026-10-27',
    width: 8, // A..H
    col: { srNo: 0, date: 1, region: 2, coaches: 3, hub: 4, fpu: 5, ldo: 6, total: 7 },
    header: ['Sr No', 'Date', 'Regions', 'Respective Coaches', 'Proposed Hub Locations', 'FPU Reading', 'LDO Reading', 'Total Reading'],
    hubs: () => RWP_GROUPS,
    regionMap: { 'Gulraiz car chowk': 'RWP', 'Bahria Ph-5': 'RWP', 'Ghauri town': 'RWP', 'DHA': 'RWP' },
    // Same BusCaro terms as Islamabad (Tahir confirmed 2026-10-26); separate invoice.
    invoice: {
      provider: 'BusCaro Technologies Pvt Ltd', account: 'Orenda Private Limited',
      fixed: 52500, kmPerLitre: 12, vehicleType: 'Hatchback (AC)',
      names: {
        'Gulraiz car chowk': 'Niete Gulraiz car chowk - Rawalpindi side',
        'Bahria Ph-5': 'Niete Bahria phase 5 - For Rawalpindi',
        'Ghauri town': 'Ghauri town ph-5 - For Rawalpindi',
        'DHA': 'DHA - Niete(Rawalpindi)',
      },
    },
  },
};

// Every monitored hub, both fleets. HUB_GROUPS stays Islamabad-only so the
// older Islamabad endpoints keep their exact behaviour.
const ALL_HUBS = () => [...HUB_GROUPS.map(h => ({ fleet: 'islamabad', ...h })), ...RWP_GROUPS];
const findHub = hubName => ALL_HUBS().find(h => h.hubName.trim().toLowerCase() === String(hubName).trim().toLowerCase());
function fleetForHub(hubName) {
  const h = findHub(hubName);
  return (h && h.fleet) || 'islamabad';
}

// hubName -> 'trip' | 'odometer'; unknown hubs fall back to the safer 'trip'.
function meterTypeFor(hubName) {
  const hub = findHub(hubName);
  return (hub && hub.meter) || 'trip';
}

function isHubGroup(chatId) {
  return ALL_HUBS().some(h => h.groupId === chatId);
}

function hubNameForChat(chatId) {
  const hub = ALL_HUBS().find(h => h.groupId === chatId);
  return hub ? hub.hubName : null;
}

module.exports = { HUB_GROUPS, RWP_GROUPS, FLEETS, ALL_HUBS, fleetForHub, meterTypeFor, isHubGroup, hubNameForChat };