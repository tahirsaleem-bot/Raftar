// v7: last drum classified against labelled last-drum exemplars (rolled ones included) + whole digits
const { buildTemplates, classify, loadAll } = require('./drum6.js');
(async () => {
  const ABS = +process.argv[2] || 0.88, MARGIN = +process.argv[3] || 0.04, ABS5 = +process.argv[4] || 0.85;
  const { data, font } = await loadAll();
  let ok = 0, ref = 0, wrong = 0;
  for (let k = 0; k < data.length; k++) {
    const train = data.filter(d => d.t !== data[k].t);
    const { ex } = buildTemplates(train, font);
    const ex5 = {}; for (const [dg, ts] of Object.entries(ex)) ex5[dg] = [...ts];
    const { cellsOf } = require('./drum6.js');
    // add the rolled last-drum cells from training, labelled with the sheet value
    const norm = v => { let m = 0; for (const x of v) m += x; m /= v.length; let s = 0; const o = v.map(x => x - m); for (const x of o) s += x * x; s = Math.sqrt(s) || 1; return o.map(x => x / s); };
    const CW = 22, CH = 34, PAD = 3, WW = 28;
    const centre = v => { const p = new Float32Array(CW * CH); for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) p[y * CW + x] = v[(y + PAD) * WW + x + PAD]; return p; };
    for (const d of train) if (!d.full5) (ex5[d.t[4]] = ex5[d.t[4]] || []).push(norm(centre(d.cells[4])));
    let txt = '', why = '';
    for (let c = 0; c < 5 && !why; c++) {
      const o = classify(data[k].cells[c], c < 4 ? ex : ex5), m = o[0][1] - o[1][1];
      if (o[0][1] >= (c < 4 ? ABS : ABS5) && m >= MARGIN) txt += o[0][0]; else why = `d${c + 1} ${o[0][0]}${o[0][1].toFixed(2)}/${o[1][0]}${o[1][1].toFixed(2)}`;
    }
    const good = !why && Math.abs(+txt - +data[k].t) <= 0;
    if (why) ref++; else if (good) ok++; else wrong++;
    console.log(k, data[k].t, why ? 'REFUSE ' + why : txt, !why && !good ? '<< WRONG' : '');
  }
  console.log(`ok ${ok} refused ${ref} WRONG ${wrong}`);
})();
