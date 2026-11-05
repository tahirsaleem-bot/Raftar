// Drum odometer reader v6: real-exemplar templates (+ font fill-in for digits
// never seen whole), NCC with shift search for digits 1-4, and a rolling-strip
// match for the last drum. Leave-one-out evaluation on the labelled crops.
const Jimp = require('../../node_modules/jimp');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;

const CW = 22, CH = 34, PAD = 3, WW = CW + 2 * PAD, HH = CH + 2 * PAD;
const TRUTH = '41824 41874 41934 41961 42004 42036 42036 42073 42073 42181 42181 42221 42276 42276 42375 42415 42415 42494'.split(' ');
// last drum shown whole (not mid-roll) in these crops
const FULL5 = new Set([2, 5, 6, 9, 10, 11]);

function norm(v) { let m = 0; for (const x of v) m += x; m /= v.length; let s = 0; const o = new Float32Array(v.length); for (let i = 0; i < v.length; i++) { o[i] = v[i] - m; s += o[i] * o[i]; } s = Math.sqrt(s) || 1; for (let i = 0; i < o.length; i++) o[i] /= s; return o; }

// window crop -> 5 padded grayscale cells, 0..1, digit bright
async function cellsOf(img) {
  const im = img.clone().greyscale();
  const W0 = im.bitmap.width, H0 = im.bitmap.height;
  const x0 = W0 * 0.015, x1 = W0 * 0.985, y0 = H0 * 0.06, y1 = H0 * 0.94, cw = (x1 - x0) / 5;
  const out = [];
  for (let c = 0; c < 5; c++) {
    const cell = im.clone().crop(Math.round(x0 + c * cw), Math.round(y0), Math.round(cw), Math.round(y1 - y0)).resize(WW, HH, Jimp.RESIZE_BILINEAR);
    const v = new Float32Array(WW * HH); let lo = 255, hi = 0;
    for (let i = 0; i < v.length; i++) { v[i] = cell.bitmap.data[i * 4]; }
    const s = [...v].sort((a, b) => a - b); lo = s[Math.floor(s.length * 0.05)]; hi = s[Math.floor(s.length * 0.98)];
    for (let i = 0; i < v.length; i++) v[i] = Math.max(0, Math.min(1, (v[i] - lo) / ((hi - lo) || 1)));
    out.push(v);
  }
  return out;
}
const patch = (v, dx, dy) => { const p = new Float32Array(CW * CH); for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) p[y * CW + x] = v[(y + PAD + dy) * WW + x + PAD + dx]; return p; };
function nccBest(v, tn) { let best = -1; for (let dy = -PAD; dy <= PAD; dy++) for (let dx = -PAD; dx <= PAD; dx++) { const p = norm(patch(v, dx, dy)); let s = 0; for (let i = 0; i < p.length; i++) s += p[i] * tn[i]; if (s > best) best = s; } return best; }

// font digit, light weight, stretched to the real drum proportions, as a CWxCH 0..1 cell
async function fontCell(d, fam = 'Bahnschrift_Light') {
  const g = await Jimp.read(path.join(DIR, 'font', `${fam}_${d}.png`)); g.greyscale();
  // tight box
  const W = g.bitmap.width, H = g.bitmap.height; let a = W, b = 0, c = H, e = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g.bitmap.data[(y * W + x) * 4] > 100) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); e = Math.max(e, y); }
  g.crop(a, c, b - a + 1, e - c + 1);
  // real digits fill ~62% of cell width and ~80% of cell height
  const dw = Math.round(CW * 0.62), dh = Math.round(CH * 0.8);
  g.resize(d === 1 ? Math.max(3, Math.round(dw * 0.25)) : dw, dh, Jimp.RESIZE_BILINEAR).blur(1);
  const cell = new Jimp(CW, CH, 0x000000ff); cell.composite(g, Math.round((CW - g.bitmap.width) / 2), Math.round((CH - dh) / 2));
  const v = new Float32Array(CW * CH); for (let i = 0; i < v.length; i++) v[i] = cell.bitmap.data[i * 4] / 255; return v;
}

async function loadAll() {
  const fl = fs.readdirSync(path.join(DIR, 'crops')).sort();
  const data = [];
  for (let i = 0; i < fl.length; i++) data.push({ t: TRUTH[i], cells: await cellsOf(await Jimp.read(path.join(DIR, 'crops', fl[i]))), full5: FULL5.has(i) });
  const font = {}; for (let d = 0; d < 10; d++) font[d] = await fontCell(d);
  return { data, font };
}

// templates from training items: per digit, list of normalised centre patches; mean cell for the strip
function buildTemplates(train, font) {
  const ex = {}, sum = {}, cnt = {};
  for (const d of train) for (let c = 0; c < 5; c++) {
    if (c === 4 && !d.full5) continue;
    const dg = d.t[c], p = patch(d.cells[c], 0, 0);
    (ex[dg] = ex[dg] || []).push(norm(p));
    if (!sum[dg]) { sum[dg] = new Float32Array(CW * CH); cnt[dg] = 0; }
    for (let i = 0; i < p.length; i++) sum[dg][i] += p[i]; cnt[dg]++;
  }
  const mean = {};
  for (let d = 0; d < 10; d++) {
    const k = String(d);
    if (cnt[k]) { mean[k] = sum[k].map(x => x / cnt[k]); }
    else { mean[k] = font[d]; (ex[k] = ex[k] || []).push(norm(font[d])); }
  }
  return { ex, mean };
}

function classify(v, ex) {
  return Object.entries(ex).map(([dg, ts]) => [dg, Math.max(...ts.map(t => nccBest(v, t)))]).sort((a, b) => b[1] - a[1]);
}

// last drum: slide a window over the stacked strip 0..9,0 (period P rows) and
// find the offset that matches best. Returns fractional position in digits.
function rollRead(v, mean, gapFrac) {
  const gap = Math.round(CH * gapFrac), P = CH + gap, rows = P * 11;
  const strip = new Float32Array(CW * rows);
  for (let k = 0; k < 11; k++) { const m = mean[String(k % 10)]; for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) strip[(k * P + y) * CW + x] = m[y * CW + x]; }
  // the cell shows CH rows centred on the digit: window starts gap/2 above the digit top
  let best = [-2, 0];
  for (let off = 0; off <= P * 10; off++) {
    for (let dx = -PAD; dx <= PAD; dx++) {
      const win = new Float32Array(CW * CH);
      for (let y = 0; y < CH; y++) { const sy = off + y - Math.round(gap / 2); for (let x = 0; x < CW; x++) win[y * CW + x] = sy >= 0 && sy < rows ? strip[sy * CW + x] : 0; }
      const p = norm(patch(v, dx, 0)), w = norm(win); let s = 0; for (let i = 0; i < p.length; i++) s += p[i] * w[i];
      if (s > best[0]) best = [s, off];
    }
  }
  return { score: best[0], pos: best[1] / P };
}

module.exports = { cellsOf, buildTemplates, classify, rollRead, loadAll, TRUTH };

if (require.main === module) (async () => {
  const ABS = +process.argv[2] || 0.88, MARGIN = +process.argv[3] || 0.04, GAP = +process.argv[4] || 0.3;
  const { data, font } = await loadAll();
  let ok = 0, ref = 0, wrong = 0;
  for (let k = 0; k < data.length; k++) {
    const train = data.filter(d => d.t !== data[k].t);
    const { ex, mean } = buildTemplates(train, font);
    let txt = '', why = '';
    for (let c = 0; c < 4 && !why; c++) {
      const o = classify(data[k].cells[c], ex), m = o[0][1] - o[1][1];
      if (o[0][1] >= ABS && m >= MARGIN) txt += o[0][0]; else why = `d${c + 1} ${o[0][0]}${o[0][1].toFixed(2)}/${o[1][0]}${o[1][1].toFixed(2)}`;
    }
    let roll = null;
    if (!why) {
      roll = rollRead(data[k].cells[4], mean, GAP);
      const d = Math.round(roll.pos) % 10; // the drum mostly in view
      if (roll.score >= 0.8) txt += d; else why = `d5 roll score ${roll.score.toFixed(2)}`;
    }
    const truth = +data[k].t, got = +txt;
    const good = !why && Math.abs(got - truth) <= 1;
    if (why) ref++; else if (good) ok++; else wrong++;
    console.log(k, data[k].t, why ? 'REFUSE ' + why : txt, roll ? `roll ${roll.pos.toFixed(2)} s=${roll.score.toFixed(2)}` : '', !why && !good ? '<< WRONG' : '');
  }
  console.log(`abs ${ABS} margin ${MARGIN} gap ${GAP}: ok ${ok} refused ${ref} WRONG ${wrong}`);
})();
