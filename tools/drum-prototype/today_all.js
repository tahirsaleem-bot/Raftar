const L = require('C:/Raftar/ai-agent-starter/src/sheets/logisticsClient');
(async () => {
  const d = process.argv[2];
  for (const fl of ['islamabad', 'rawalpindi']) {
    const C = L.forFleet(fl); const rows = await C.getAllRows();
    for (const r of rows) if (L.sameDate((r[C.COL.date] || '').trim(), d)) console.log(fl.padEnd(10), (r[C.COL.hub] || '').padEnd(20), 'FPU', String(r[C.COL.fpu] || '-').padEnd(8), 'LDO', String(r[C.COL.ldo] || '-').padEnd(8), 'Total', r[C.COL.total] || '-');
  }
})();
