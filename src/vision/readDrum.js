// Mechanical drum odometer reader for Gulraiz car chowk's car (white dial,
// 5 white digits in a small dark window). Offline and free, like readSevenSeg:
// it refuses rather than guesses, and the hub validation runs after it.
//
// How it reads:
//   1. find the window: a dark, wide rectangle surrounded by the bright dial
//   2. split it into 5 equal drum cells
//   3. compare each cell with this car's own labelled digits (src/vision/drum/
//      labelled/<value>_<f|n>_<i>.png, f = last drum shown whole) by normalised
//      cross-correlation over small shifts; Bahnschrift Light fills in a digit
//      never seen whole (5)
//   4. 0/6/8/9 look alike when blurred, so their stroke profile must agree
//   5. every digit needs a clear winner; the last drum is often mid-roll, so it
//      is also compared with earlier mid-roll cells labelled with the sheet value
// Leave-one-out on the 18 labelled photos (2026-11-05): 12 read, 6 refused, 0 wrong.
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const DRUM_DIR = path.join(__dirname, 'drum');
const CW = 22, CH = 34, PAD = 3, WW = CW + 2 * PAD, HH = CH + 2 * PAD;
const ABS = 0.88, ABS_LAST = 0.85, MARGIN = 0.04;
const SHAPE = { 0: 'LR LR LR', 5: 'L LMR R', 6: 'L LMR LR', 8: 'LR LMR LR', 9: 'LR LMR R' };

function components(mask, W, H) {
  const lab = new Int32Array(W * H).fill(-1), out = [];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const st = [s]; lab[s] = out.length; let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    while (st.length) {
      const p = st.pop(); n++; const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - W, p + W]) if (q >= 0 && q < W * H && mask[q] && lab[q] < 0 && Math.abs((q % W) - x) <= 1) { lab[q] = out.length; st.push(q); }
    }
    out.push({ n, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return out;
}

// 1. the odometer window, cropped from the full-resolution photo
async function findWindow(buf) {
  const orig = await Jimp.read(buf);
  const img = orig.clone().resize(800, Jimp.AUTO);
  const W = img.bitmap.width, H = img.bitmap.height, D = img.bitmap.data;
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = (D[i * 4] + D[i * 4 + 1] + D[i * 4 + 2]) / 3;
  // "dark" relative to the dial: on a bright morning (2026-11-06) the window
  // was 75-115 against a 225 dial, so a fixed <90 cut it into pieces
  const sorted = Float32Array.from(L).sort(), dialL = sorted[Math.floor(sorted.length * 0.9)];
  const th = Math.min(130, 0.58 * dialL);
  const dark = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) dark[i] = L[i] < th ? 1 : 0;
  // bridge the bright digits inside the window (gaps up to 8 px along a row)
  for (let y = 0; y < H; y++) { let last = -1; for (let x = 0; x < W; x++) { const i = y * W + x; if (dark[i]) { if (last >= 0 && x - last > 1 && x - last <= 8) for (let k = last + 1; k < x; k++) dark[y * W + k] = 1; last = x; } } }
  const ring = c => { let s = 0, n = 0; for (let x = c.x0; x <= c.x1; x++) for (const y of [c.y0 - 6, c.y1 + 6]) if (y >= 0 && y < H) { s += L[y * W + x]; n++; } return n ? s / n : 0; };
  const cand = components(dark, W, H)
    .filter(c => c.w > 50 && c.w < 300 && c.w / c.h > 2.5 && c.w / c.h < 6 && c.n > 0.5 * c.w * c.h)
    .map(c => ({ ...c, ring: ring(c) })).filter(c => c.ring > 140).sort((a, b) => b.n - a.n);
  if (!cand.length) return null;
  const c = cand[0], k = orig.bitmap.width / 800;
  return orig.crop(Math.round(c.x0 * k), Math.round(c.y0 * k), Math.round(c.w * k), Math.round(c.h * k)).resize(400, Jimp.AUTO);
}

// 2. five padded grayscale cells, contrast-stretched to 0..1 (digit bright)
function cellsOf(win) {
  const im = win.clone().greyscale();
  const W0 = im.bitmap.width, H0 = im.bitmap.height;
  const x0 = W0 * 0.015, x1 = W0 * 0.985, y0 = H0 * 0.06, y1 = H0 * 0.94, cw = (x1 - x0) / 5;
  const out = [];
  for (let c = 0; c < 5; c++) {
    const cell = im.clone().crop(Math.round(x0 + c * cw), Math.round(y0), Math.round(cw), Math.round(y1 - y0)).resize(WW, HH, Jimp.RESIZE_BILINEAR);
    const v = new Float32Array(WW * HH);
    for (let i = 0; i < v.length; i++) v[i] = cell.bitmap.data[i * 4];
    const s = [...v].sort((a, b) => a - b), lo = s[Math.floor(s.length * 0.05)], hi = s[Math.floor(s.length * 0.98)];
    for (let i = 0; i < v.length; i++) v[i] = Math.max(0, Math.min(1, (v[i] - lo) / ((hi - lo) || 1)));
    out.push(v);
  }
  return out;
}

function norm(v) {
  let m = 0; for (const x of v) m += x; m /= v.length;
  const o = new Float32Array(v.length); let s = 0;
  for (let i = 0; i < v.length; i++) { o[i] = v[i] - m; s += o[i] * o[i]; }
  s = Math.sqrt(s) || 1; for (let i = 0; i < o.length; i++) o[i] /= s; return o;
}
const patch = (v, dx, dy) => { const p = new Float32Array(CW * CH); for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) p[y * CW + x] = v[(y + PAD + dy) * WW + x + PAD + dx]; return p; };
function nccBest(v, t) {
  let best = -1;
  for (let dy = -PAD; dy <= PAD; dy++) for (let dx = -PAD; dx <= PAD; dx++) {
    const p = norm(patch(v, dx, dy)); let s = 0; for (let i = 0; i < p.length; i++) s += p[i] * t[i]; if (s > best) best = s;
  }
  return best;
}

// 4. which sides carry a stroke at 30/50/70% of the digit height
function profile(v) {
  const vals = []; for (let y = PAD; y < HH - PAD; y++) for (let x = PAD; x < WW - PAD; x++) vals.push(v[y * WW + x]); vals.sort((a, b) => a - b);
  const th = (vals[Math.floor(vals.length * 0.1)] + vals[Math.floor(vals.length * 0.95)]) / 2;
  let y0 = HH, y1 = -1, x0 = WW, x1 = -1;
  for (let y = 0; y < HH; y++) for (let x = 0; x < WW; x++) if (v[y * WW + x] > th) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  if (y1 < 0) return '';
  const rows = [];
  for (const f of [0.3, 0.5, 0.7]) {
    const yc = Math.round(y0 + (y1 - y0) * f); let L = 0, R = 0, M = 0;
    for (let y = yc - 1; y <= yc + 1; y++) for (let x = x0; x <= x1; x++) if (v[y * WW + x] > th) {
      const r = (x - x0) / Math.max(1, x1 - x0); if (r < 0.3) L++; else if (r > 0.7) R++; else M++;
    }
    rows.push((L >= 2 ? 'L' : '') + (M >= 3 ? 'M' : '') + (R >= 2 ? 'R' : ''));
  }
  return rows.join(' ');
}

// font digit, light weight, at the drum's proportions (only for digits never seen whole)
async function fontCell(d) {
  const g = await Jimp.read(path.join(DRUM_DIR, 'font', `Bahnschrift_Light_${d}.png`)); g.greyscale();
  const W = g.bitmap.width, H = g.bitmap.height; let a = W, b = 0, c = H, e = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g.bitmap.data[(y * W + x) * 4] > 100) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); e = Math.max(e, y); }
  g.crop(a, c, b - a + 1, e - c + 1);
  const dw = Math.round(CW * 0.62), dh = Math.round(CH * 0.8);
  g.resize(d === 1 ? Math.max(3, Math.round(dw * 0.25)) : dw, dh, Jimp.RESIZE_BILINEAR).blur(1);
  const cell = new Jimp(CW, CH, 0x000000ff); cell.composite(g, Math.round((CW - g.bitmap.width) / 2), Math.round((CH - dh) / 2));
  const v = new Float32Array(CW * CH); for (let i = 0; i < v.length; i++) v[i] = cell.bitmap.data[i * 4] / 255; return v;
}

// 3/5. templates: digits 1-4 from whole digits; the last drum also from mid-roll cells
let templates = null;
async function loadTemplates(exclude) {
  // exclude: leave one reading out (testing only), never cached
  if (templates && !exclude) return templates;
  const ex = {}, last = {};
  const add = (bank, dg, v) => (bank[dg] = bank[dg] || []).push(norm(patch(v, 0, 0)));
  for (const f of fs.readdirSync(path.join(DRUM_DIR, 'labelled')).filter(f => f.endsWith('.png'))) {
    const [val, full] = f.split('_');
    if (val === exclude) continue;
    const cells = cellsOf(await Jimp.read(path.join(DRUM_DIR, 'labelled', f)));
    for (let c = 0; c < 4; c++) add(ex, val[c], cells[c]);
    if (full === 'f') add(ex, val[4], cells[4]); else add(last, val[4], cells[4]);
  }
  for (let d = 0; d < 10; d++) if (!ex[d]) (ex[d] = []).push(norm(await fontCell(d)));
  for (const [dg, ts] of Object.entries(ex)) last[dg] = [...(last[dg] || []), ...ts];
  if (exclude) return { ex, last };
  templates = { ex, last };
  return templates;
}

const rank = (v, bank) => Object.entries(bank).map(([dg, ts]) => [dg, Math.max(...ts.map(t => nccBest(v, t)))]).sort((a, b) => b[1] - a[1]);

async function readDrum(buf, opts = {}) {
  const win = await findWindow(buf);
  if (!win) return { ok: false, reason: 'no odometer window in the photo' };
  const { ex, last } = await loadTemplates(opts.exclude);
  const cells = cellsOf(win);
  let text = '';
  for (let c = 0; c < 5; c++) {
    const o = rank(cells[c], c < 4 ? ex : last);
    if (opts.debug) console.log("cell", c + 1, profile(cells[c]), o.slice(0, 4).map(r => r[0] + r[1].toFixed(2)).join(" "));
    let [top, second] = o, margin = top[1] - second[1];
    // the stroke profile is noisy, so it only settles close calls (42181 vs 42161: margin 0.02)
    if (c < 4 && SHAPE[top[0]] && margin < 0.06) {
      const p = profile(cells[c]);
      if (SHAPE[second[0]] && p === SHAPE[second[0]] && p !== SHAPE[top[0]]) { [top, second] = [second, top]; margin = MARGIN; }
      else if (p === SHAPE[top[0]]) margin = Math.max(margin, MARGIN);
      else if (SHAPE[second[0]]) return { ok: false, reason: `digit ${c + 1}: shape ${p} fits neither ${top[0]} nor ${second[0]}` };
      const other = Object.keys(SHAPE).find(d => d !== top[0] && SHAPE[d] === p);
      if (other && p !== SHAPE[top[0]]) return { ok: false, reason: `digit ${c + 1} looks like ${top[0]} but has the shape of ${other}` };
    }
    const clear = (top[1] >= (c < 4 ? ABS : ABS_LAST) && margin >= MARGIN) || (top[1] >= (c < 4 ? ABS : ABS_LAST) - 0.06 && margin >= 0.1);
    if (!clear) {
      return { ok: false, reason: `digit ${c + 1} unclear (${top[0]} ${top[1].toFixed(2)} vs ${second[0]} ${second[1].toFixed(2)})`, partial: text };
    }
    text += top[0];
  }
  return { ok: true, km: parseInt(text, 10), text };
}

module.exports = { readDrum, findWindow };
