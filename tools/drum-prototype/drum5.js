const { cellsOf, center, ncc } = require('./drum4.js');
const fs = require('fs');
const S = 'C:/Users/tahir/AppData/Local/Temp/claude/c39612e77a1026af/92786cf6-c62a-471b-9f82-ffbe874c29b7/scratchpad';
const FULL5 = new Set([2, 5, 6, 9, 10, 11]);
const [ABS, MARGIN] = [+process.argv[2] || 0.87, +process.argv[3] || 0.03];
function decide(best) {
  let txt = '';
  for (let c = 0; c < 5; c++) {
    const o = best[c], m = o[0][1] - o[1][1];
    if (o[0][1] >= ABS && m >= MARGIN) { txt += o[0][0]; continue; }
    if (c === 4) { const a = +o[0][0], b = +o[1][0]; if ((a - b + 10) % 10 === 1 || (b - a + 10) % 10 === 1) { txt += ((a - b + 10) % 10 === 1) ? b : a; continue; } }
    return { why: `d${c + 1} ${o[0][0]}${o[0][1].toFixed(2)}/${o[1][0]}${o[1][1].toFixed(2)}` };
  }
  return { txt };
}
module.exports = { decide };
if (require.main === module) (async () => {
  const truth = '41824 41874 41934 41961 42004 42036 42036 42073 42073 42181 42181 42221 42276 42276 42375 42415 42415 42494'.split(' ');
  // last digit truth for rolling cases: accept the shown lower digit or +1
  const fl = fs.readdirSync(S + '/crops').sort();
  const data = []; for (let i = 0; i < fl.length; i++) data.push({ t: truth[i], f: await cellsOf(S + '/crops/' + fl[i]) });
  let ok = 0, wrong = 0, ref = 0;
  for (let k = 0; k < data.length; k++) {
    const tm = {}; for (const d of data) if (d.t !== data[k].t) for (let c = 0; c < 5; c++) if (c < 4 || FULL5.has(data.indexOf(d))) (tm[d.t[c]] = tm[d.t[c]] || []).push(center(d.f[c]));
    const best = data[k].f.map(f => Object.entries(tm).map(([dg, ts]) => [dg, Math.max(...ts.map(t => ncc(f, t)))]).sort((a, b) => b[1] - a[1]));
    const r = decide(best);
    const good = r.txt && (+r.txt === +data[k].t || +r.txt === +data[k].t + 1 || +r.txt === +data[k].t - 1);
    if (r.why) ref++; else if (good) ok++; else wrong++;
    console.log(k, data[k].t, r.why ? 'REFUSE ' + r.why : r.txt, !r.why && !good ? '<< WRONG' : '');
  }
  console.log(`abs ${ABS} margin ${MARGIN}: ok(±1 last) ${ok} refused ${ref} WRONG ${wrong}`);
})();
