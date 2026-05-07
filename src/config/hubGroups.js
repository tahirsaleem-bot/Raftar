// ─── Hub → WhatsApp Group Mapping ────────────────────────────────────────────
// hubName must match the "Proposed Hub Locations" column in the Logistics sheet.

const HUB_GROUPS = [
  {
    hubName: 'E-9 AHQ',
    groupId: '120363322453549511@g.us', // E-9 - Bara Kahu Niete
  },
  {
    hubName: 'lane 6',
    groupId: '120363302269376354@g.us', // Scheme 3 - Nilore Niete
  },
  {
    hubName: 'Khawaja corporation',
    groupId: '120363303640759505@g.us', // Khwaja Corporation - Sihala Niete
  },
  {
    hubName: 'Tramri Chowk',
    groupId: '120363302485844145@g.us', // Taramri Chowk - Sihala Niete
  },
  {
    hubName: 'H-13 Tarnol',
    groupId: '120363303936357672@g.us', // H-13 - Tarnol Niete
  },
  {
    hubName: 'I-10 Tarnol',
    groupId: '120363302781594420@g.us', // I-10 - Tarnol Niete
  },
  {
    hubName: 'Misrial Road',
    groupId: '120363350174748616@g.us', // Misriyal road - I-14 - Tarnol Niete
  },
];

// ─── Rawalpindi groups (excluded — do not monitor) ────────────────────────────
// Niete I-10 - For Rawalpindi       : 120363408109920568@g.us
// Niete Gulraiz car chowk - RWP     : 120363421054812106@g.us
// Niete Bahria phase 5 - For RWP    : 120363405007279347@g.us
// Faizabad - i10 - Rawalpindi       : 120363420278137966@g.us
// Bahria phase 5 - Rawalpindi       : 120363404200028541@g.us
// Niete RWP                         : 120363401612936855@g.us

module.exports = { HUB_GROUPS };
