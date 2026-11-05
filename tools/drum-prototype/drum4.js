// grayscale digit cells, z-normalised, compared by best normalised cross-correlation over small shifts
const Jimp = require('C:/Raftar/ai-agent-starter/node_modules/jimp');
const fs = require('fs');
const S = 'C:/Users/tahir/AppData/Local/Temp/claude/c39612e77a1026af/92786cf6-c62a-471b-9f82-ffbe874c29b7/scratchpad';
const CW = 20, CH = 32, PAD = 3;
async function cellsOf(file) {
  const im = await Jimp.read(file); im.greyscale();
  // trim window border, then 5 equal cells, each resampled to (CW+2PAD)x(CH+2PAD)
  const W0 = im.bitmap.width, H0 = im.bitmap.height;
  const x0 = W0 * 0.015, x1 = W0 * 0.985, y0 = H0 * 0.08, y1 = H0 * 0.92, cw = (x1 - x0) / 5;
  const cells = [];
  for (let c = 0; c < 5; c++) {
    const cell = im.clone().crop(Math.round(x0 + c * cw), Math.round(y0), Math.round(cw), Math.round(y1 - y0)).resize(CW + 2 * PAD, CH + 2 * PAD, Jimp.RESIZE_BILINEAR);
    const v = new Float32Array((CW + 2 * PAD) * (CH + 2 * PAD)); for (let i = 0; i < v.length; i++) v[i] = cell.bitmap.data[i * 4];
    cells.push(v);
  }
  return cells;
}
const WW = CW + 2 * PAD;
function patch(v, dx, dy) { const p = new Float32Array(CW * CH); let m = 0; for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const a = v[(y + PAD + dy) * WW + x + PAD + dx]; p[y * CW + x] = a; m += a; }
  m /= p.length; let s = 0; for (let i = 0; i < p.length; i++) { p[i] -= m; s += p[i] * p[i]; } s = Math.sqrt(s) || 1; for (let i = 0; i < p.length; i++) p[i] /= s; return p; }
function center(v) { return patch(v, 0, 0); }
function ncc(v, t) { let best = -1; for (let dy = -PAD; dy <= PAD; dy++) for (let dx = -PAD; dx <= PAD; dx++) { const p = patch(v, dx, dy); let s = 0; for (let i = 0; i < p.length; i++) s += p[i] * t[i]; if (s > best) best = s; } return best; }
module.exports = { cellsOf, center, ncc };
if (require.main === module) (async () => {
  const MARGIN = +process.argv[2] || 0.05;
  const truth = '41824 41874 41934 41961 42004 42036 42036 42073 42073 42181 42181 42221 42276 42276 42375 42415 42415 42494'.split(' ');
  const fl = fs.readdirSync(S + '/crops').sort();
  const data = []; for (let i = 0; i < fl.length; i++) data.push({ t: truth[i], f: await cellsOf(S + '/crops/' + fl[i]) });
  let ok = 0, wrong = 0, ref = 0, d4ok = 0;
  for (let k = 0; k < data.length; k++) {
    const tm = {}; for (const d of data) if (d.t !== data[k].t) for (let c = 0; c < 4; c++) (tm[d.t[c]] = tm[d.t[c]] || []).push(center(d.f[c]));
    const best = data[k].f.map(f => Object.entries(tm).map(([dg, ts]) => [dg, Math.max(...ts.map(t => ncc(f, t)))]).sort((a, b) => b[1] - a[1]));
    let txt = '', why = '';
    for (let c = 0; c < 4; c++) { const o = best[c], m = o[0][1] - o[1][1]; if (m >= MARGIN) txt += o[0][0]; else { why = `d${c + 1} ${o[0][0]}/${o[1][0]} m=${m.toFixed(3)}`; break; } }
    if (!why) { if (txt === data[k].t.slice(0, 4)) d4ok++; }
    const r = why ? 'REFUSE ' + why : txt;
    if (why) ref++; else if (txt === data[k].t.slice(0, 4)) ok++; else wrong++;
    console.log(k, data[k].t.slice(0, 4), r, best.slice(0, 4).map(o => `${o[0][0]}${o[0][1].toFixed(2)}/${o[1][0]}${o[1][1].toFixed(2)}`).join(' '), !why && txt !== data[k].t.slice(0, 4) ? '<< WRONG' : '');
  }
  console.log(`first4 margin ${MARGIN}: ok ${ok} refused ${ref} WRONG ${wrong}`);
})();
