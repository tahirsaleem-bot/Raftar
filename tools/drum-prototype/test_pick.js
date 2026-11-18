// pickDrumCandidate edge cases against the real sheet, with getLastReading / todayISO faked
const L = require('C:/Raftar/ai-agent-starter/src/sheets/logisticsClient');
const { pickDrumCandidate } = require('C:/Raftar/ai-agent-starter/src/vision/extractKM');
const C = L.forHub('Gulraiz car chowk');
const realToday = L.todayISO;
async function t(name, last, today, cands, expect) {
  C.getLastReading = async () => last; L.todayISO = () => today;
  const r = await pickDrumCandidate('Gulraiz car chowk', cands);
  const got = r ? r.km : null;
  console.log(got === expect ? 'PASS' : 'FAIL', name, '->', got, 'expected', expect);
}
(async () => {
  await t('today FPU: Fri LDO, Mon off', { km: 42572, date: '11-06-2026', iso: '2026-11-06' }, '2026-11-10', [42623, 42823], 42623);
  await t('6 Nov LDO: same-day FPU', { km: 42536, date: '11-06-2026', iso: '2026-11-06' }, '2026-11-06', [42672, 42572], 42572);
  await t('both within 120 same day', { km: 42536, date: '11-06-2026', iso: '2026-11-06' }, '2026-11-06', [42546, 42556], null);
  await t('below last reading', { km: 42536, date: '11-06-2026', iso: '2026-11-06' }, '2026-11-06', [42436, 42536], 42536);
  await t('blank weekday between (21-22 Oct gap)', { km: 41518, date: '10-20-2026', iso: '2026-10-20' }, '2026-10-26', [41768, 41968], null);
  await t('next day, no gap', { km: 42494, date: '11-05-2026', iso: '2026-11-05' }, '2026-11-06', [42536, 42836], 42536);
  await t('overnight >130 refused', { km: 42494, date: '11-05-2026', iso: '2026-11-05' }, '2026-11-06', [42636, 42836], null);
  L.todayISO = realToday;
})();
