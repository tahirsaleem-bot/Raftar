const Jimp = require('jimp');

// ─── Seven-segment reader for the Suzuki Alto amber trip LCD ──────────────────
// Every hub vehicle is a Suzuki Alto, and every meter photo shows the same
// amber LCD: a trip meter "A"/"B" reading such as `0.0 km` or `299.5 km`.
// Tesseract cannot read seven-segment digits (it read 8 of 9 photos on
// 2026-10-20 as nothing, and the ninth as a wrong number), so this module
// reads the segments directly. Free, offline, no API key.
//
// Pipeline:
//   1. find the amber LCD (largest orange component) on a 1000px copy, then
//      re-read that crop from the full-resolution photo at a fixed width
//   2. dark marks = pixels clearly darker than the local LCD background,
//      measured on the GREEN channel (red saturates on the amber backlight)
//   3. straighten a tilted photo (horizontal segments / rule lines are level)
//   4. group segments into glyphs, take the row of tallest glyphs
//   5. undo the italic slant, split glyphs on empty columns, read the 7
//      segments of each glyph, find the decimal point
//
// It is built to REFUSE rather than guess. A blank cell is fixed by hand in
// seconds; a wrong number in the fleet sheet goes unnoticed. Every reading
// must pass all of these or it is rejected:
//   * format NNNN.N — the trip meter always shows exactly one decimal and
//     never a leading zero (except the single 0 of 0.x)
//   * every glyph matches a digit pattern exactly
//   * no unexplained mark just left of the reading (a missed leading digit
//     turns 651.3 into 1.3), no glare hole in the row, LCD not clipped
//   * every segment called "off" is genuinely blank in the raw image (a faint
//     segment turns 7 into 1)
//   * readMeter(): two independent passes at different scales must agree
// Measured on 160 held-out hub photos (2026-10-20): 69% read, 0 wrong.
// 2026-10-27 (Raftar: clear photos were being sent back to drivers): retry at
// looser contrast for pale LCDs, re-join digits split by glare, accept a faint
// lone decimal point. Held-out 144: 86% read, 0 wrong; 52 new live: 87%, 0 wrong.

function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, mx ? d / mx : 0, mx / 255];
}

function minMax(arr) {
  let lo = Infinity, hi = -Infinity;
  for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}

// Connected components over a boolean grid (8-connectivity).
function components(mask, W, H) {
  const lab = new Int32Array(W * H).fill(-1);
  const comps = [];
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || lab[i] >= 0) continue;
    const c = { id: comps.length, x0: W, y0: H, x1: -1, y1: -1, n: 0, px: [] };
    lab[i] = c.id; stack.push(i);
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p / W) | 0;
      c.n++; c.px.push(p);
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (mask[q] && lab[q] < 0) { lab[q] = c.id; stack.push(q); }
      }
    }
    c.w = c.x1 - c.x0 + 1; c.h = c.y1 - c.y0 + 1;
    comps.push(c);
  }
  return { comps, lab };
}

// segments: a b c d e f g
const PATTERNS = {
  0: [1, 1, 1, 1, 1, 1, 0], 1: [0, 1, 1, 0, 0, 0, 0], 2: [1, 1, 0, 1, 1, 0, 1],
  3: [1, 1, 1, 1, 0, 0, 1], 4: [0, 1, 1, 0, 0, 1, 1], 5: [1, 0, 1, 1, 0, 1, 1],
  6: [1, 0, 1, 1, 1, 1, 1], 7: [1, 1, 1, 0, 0, 0, 0], 8: [1, 1, 1, 1, 1, 1, 1],
  9: [1, 1, 1, 1, 0, 1, 1],
};
// segment sampling boxes inside a deskewed glyph: [x0, x1, y0, y1] as fractions
const SEGBOX = [
  [0.3, 0.7, 0, 0.15],    // a
  [0.7, 1, 0.15, 0.42],   // b
  [0.7, 1, 0.58, 0.85],   // c
  [0.3, 0.7, 0.85, 1],    // d
  [0, 0.3, 0.58, 0.85],   // e
  [0, 0.3, 0.15, 0.42],   // f
  [0.3, 0.7, 0.42, 0.58], // g
];

async function readLcd(buf, opts = {}) {
  const img = await Jimp.read(buf);
  if (!opts.stage2) {
    const scale = 1000 / Math.max(img.bitmap.width, img.bitmap.height);
    img.resize(Math.round(img.bitmap.width * scale), Math.round(img.bitmap.height * scale));
  }
  const W = img.bitmap.width, H = img.bitmap.height, D = img.bitmap.data;

  // 1. amber LCD
  const V = new Float32Array(W * H);
  const amber = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const [h, s, v] = hsv(D[i * 4], D[i * 4 + 1], D[i * 4 + 2]);
    V[i] = D[i * 4 + 1] / 255; // green: red saturates on the amber backlight
    if (h >= 10 && h <= (opts.hueMax || 55) && s >= 0.2 && v >= 0.5) amber[i] = 1;
  }
  const { comps: ac } = components(amber, W, H);
  ac.sort((a, b) => b.n - a.n);
  const lcd = ac[0];
  if (!lcd || lcd.n < W * H * 0.004) return { ok: false, reason: 'no amber LCD in the photo' };

  // Stage 1 only locates the LCD; re-read it from the full-resolution photo,
  // scaled so the digits are big enough to resolve individual segments.
  if (!opts.stage2) {
    const orig = await Jimp.read(buf);
    const k = orig.bitmap.width / W;
    const mx = lcd.w * 0.06, my = lcd.h * 0.06;
    const x0 = Math.max(0, Math.floor((lcd.x0 - mx) * k)), y0 = Math.max(0, Math.floor((lcd.y0 - my) * k));
    const x1 = Math.min(orig.bitmap.width, Math.ceil((lcd.x1 + mx) * k)), y1 = Math.min(orig.bitmap.height, Math.ceil((lcd.y1 + my) * k));
    orig.crop(x0, y0, x1 - x0, y1 - y0);
    orig.resize(opts.target || 900, Jimp.AUTO, Jimp.RESIZE_BICUBIC);
    return readLcd(await orig.getBufferAsync(Jimp.MIME_PNG), { ...opts, stage2: true });
  }

  // LCD region = row span ∩ column span of the amber component
  const inL = new Uint8Array(W * H);
  for (const p of lcd.px) inL[p] = 1;
  const rowReg = new Uint8Array(W * H), colReg = new Uint8Array(W * H);
  for (let y = lcd.y0; y <= lcd.y1; y++) {
    let a = -1, b = -1;
    for (let x = lcd.x0; x <= lcd.x1; x++) if (inL[y * W + x]) { if (a < 0) a = x; b = x; }
    if (a >= 0) for (let x = a; x <= b; x++) rowReg[y * W + x] = 1;
  }
  for (let x = lcd.x0; x <= lcd.x1; x++) {
    let a = -1, b = -1;
    for (let y = lcd.y0; y <= lcd.y1; y++) if (inL[y * W + x]) { if (a < 0) a = y; b = y; }
    if (a >= 0) for (let y = a; y <= b; y++) colReg[y * W + x] = 1;
  }
  const region = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) region[i] = rowReg[i] & colReg[i];

  // 2. local background brightness: trimmed mean of amber pixels per grid cell
  const G = Math.max(6, Math.round(lcd.h / 12));
  const gw = Math.ceil(W / G), gh = Math.ceil(H / G);
  const sum = new Float32Array(gw * gh), cnt = new Float32Array(gw * gh);
  const cellOf = p => (((p / W) | 0) / G | 0) * gw + ((p % W) / G | 0);
  for (const p of lcd.px) { const k = cellOf(p); sum[k] += V[p]; cnt[k]++; }
  {
    const s2 = new Float32Array(gw * gh), c2 = new Float32Array(gw * gh);
    for (const p of lcd.px) { const k = cellOf(p); if (V[p] >= 0.85 * sum[k] / cnt[k]) { s2[k] += V[p]; c2[k]++; } }
    for (let k = 0; k < gw * gh; k++) if (c2[k] > 3) { sum[k] = s2[k]; cnt[k] = c2[k]; }
  }
  let globalBg = 0; for (const p of lcd.px) globalBg += V[p]; globalBg /= lcd.n;
  const bgAt = (x, y) => {
    const cx = (x / G) | 0, cy = (y / G) | 0; let s = 0, c = 0;
    for (let r = 1; r <= 3 && !c; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const X = cx + dx, Y = cy + dy; if (X < 0 || Y < 0 || X >= gw || Y >= gh) continue;
        const k = Y * gw + X; if (cnt[k] > 3) { s += sum[k] / cnt[k]; c++; }
      }
    return c ? s / c : globalBg;
  };

  // 3. dark marks, with hysteresis: weak pixels survive only when connected
  // to a strong one, which keeps faint segment edges without picking up noise
  const dark = new Uint8Array(W * H);
  for (let y = lcd.y0; y <= lcd.y1; y++) for (let x = lcd.x0; x <= lcd.x1; x++) {
    const i = y * W + x;
    if (!region[i]) continue;
    const rr = V[i] / bgAt(x, y);
    if (rr < (opts.weak || 0.8)) dark[i] = rr < (opts.strong || 0.72) ? 2 : 1;
  }
  {
    const { comps: wc } = components(dark, W, H);
    for (const c of wc) { const strong = c.px.some(p => dark[p] === 2); for (const p of c.px) dark[p] = strong ? 1 : 0; }
  }
  const { comps: dc } = components(dark, W, H);
  const touches = c => c.px.some(p => !region[p - 1] || !region[p + 1] || !region[p - W] || !region[p + W]);
  const blobs = dc.filter(c => c.n >= 3 && !touches(c));

  // Photo tilt: horizontal segments and rule-line pieces are level on the real
  // display, so their length-weighted median slope is the tilt. Straighten
  // and re-read once.
  if (!opts.noRotate) {
    const est = [];
    for (const c of dc) {
      if (c.n < 25) continue;
      let mx = 0, my = 0; for (const p of c.px) { mx += p % W; my += (p / W) | 0; } mx /= c.n; my /= c.n;
      let sxx = 0, syy = 0, sxy = 0;
      for (const p of c.px) { const dx = p % W - mx, dy = ((p / W) | 0) - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
      const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc);
      if (Math.sqrt(l1 / l2) < 4) continue; // not bar-like
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy) * 180 / Math.PI;
      if (Math.abs(ang) > 25) continue; // vertical segments
      est.push([ang, Math.sqrt(l1)]);
    }
    est.sort((p, q) => p[0] - q[0]);
    const tw = est.reduce((s, e) => s + e[1], 0); let acc = 0, med = 0;
    for (const [ang, w] of est) { acc += w; if (acc >= tw / 2) { med = ang; break; } }
    const tilt = Math.round(med * 2) / 2;
    if (Math.abs(tilt) >= 1.5 && Math.abs(tilt) <= 20) {
      const rot = (await Jimp.read(buf)).rotate(tilt, false);
      const r2 = await readLcd(await rot.getBufferAsync(Jimp.MIME_PNG), { ...opts, noRotate: true });
      r2.rotated = tilt;
      return r2;
    }
  }

  // 4. drop rule lines (often broken into fragments by glare, so also use a
  // row projection) and the trip "A"/"B" indicator box
  const lineRow = new Uint8Array(H);
  for (let y = lcd.y0; y <= lcd.y1; y++) {
    let n = 0, wd = 0;
    for (let x = lcd.x0; x <= lcd.x1; x++) { const i = y * W + x; if (region[i]) { wd++; if (dark[i]) n++; } }
    if (wd > 20 && n > wd * 0.3) lineRow[y] = 1;
  }
  const isLineBlob = c => {
    if (c.w > lcd.w * 0.12 && c.w > c.h * 6) return true;
    if (c.h > 6) return false;
    for (let y = c.y0; y <= c.y1; y++) if (lineRow[y] || lineRow[y - 1] || lineRow[y + 1]) return true;
    return false;
  };
  const isIndicator = c => c.n / (c.w * c.h) > 0.4 && c.h > 6 && c.w / c.h > 1.1 && c.w / c.h < 2.4 && c.x1 < lcd.x0 + lcd.w * 0.45;
  const cand = blobs.filter(c => !isLineBlob(c) && !isIndicator(c));
  if (!cand.length) return { ok: false, reason: 'no digits found on the LCD' };

  // 5. group segments into glyphs: dilate, then components
  const r = Math.max(2, Math.round(lcd.h * 0.012));
  const dil = new Uint8Array(W * H);
  for (const c of cand) for (const p of c.px) {
    const x = p % W, y = (p / W) | 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) dil[ny * W + nx] = 1;
    }
  }
  const { comps: gc, lab } = components(dil, W, H);
  const groups = gc.map(g => ({ ...g, own: [] }));
  for (const c of cand) groups[lab[c.px[0]]].own.push(c);
  const box = g => {
    g.x0 = Math.min(...g.own.map(c => c.x0)); g.x1 = Math.max(...g.own.map(c => c.x1));
    g.y0 = Math.min(...g.own.map(c => c.y0)); g.y1 = Math.max(...g.own.map(c => c.y1));
    g.w = g.x1 - g.x0 + 1; g.h = g.y1 - g.y0 + 1;
  };
  const gl = groups.filter(g => g.own.length);
  gl.forEach(box);
  // a seven-segment "1"/"7" is two vertical segments with a gap: merge groups
  // stacked on top of each other (the top one sits right of the bottom: italic)
  for (let merged = true; merged;) {
    merged = false;
    outer: for (let i = 0; i < gl.length; i++) for (let j = 0; j < gl.length; j++) {
      if (i === j) continue;
      const A = gl[i], B = gl[j]; // A above B
      if (A.y1 >= B.y0 + 2 || A.y0 > B.y0) continue;
      const hh = Math.max(A.h, B.h);
      if (B.y0 - A.y1 > hh * 0.4 || Math.abs(A.h - B.h) > hh * 0.5) continue;
      const sh = (A.h + B.h) * 0.12;
      const ov = Math.min(A.x1 - sh, B.x1) - Math.max(A.x0 - sh, B.x0);
      if (ov < Math.min(A.w, B.w) * 0.4) continue;
      A.own.push(...B.own); box(A); gl.splice(j, 1); merged = true; break outer;
    }
  }
  const maxH = Math.max(...gl.map(g => g.h));
  const tall = gl.filter(g => g.h >= maxH * 0.7);
  // the reading = tall glyphs chained to the tallest one along a shared row
  const ref = tall.reduce((a, b) => (b.h > a.h ? b : a));
  const vov = (a, b) => (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)) / Math.min(a.h, b.h);
  const digitsG = [ref];
  for (let grow = true; grow;) {
    grow = false;
    for (const g of tall) {
      if (digitsG.includes(g)) continue;
      if (digitsG.some(d => vov(d, g) >= 0.5 && Math.abs(g.y0 - d.y0) <= maxH * 0.15 &&
        Math.min(Math.abs(g.x0 - d.x1), Math.abs(d.x0 - g.x1)) < maxH * 1.2)) { digitsG.push(g); grow = true; }
    }
  }
  const ry0 = Math.min(...digitsG.map(g => g.y0)), ry1 = Math.max(...digitsG.map(g => g.y1));
  const rH = ry1 - ry0 + 1;
  const gx0 = Math.min(...digitsG.map(g => g.x0)), gx1 = Math.max(...digitsG.map(g => g.x1));
  // every mark inside the digit row's box (picks up the decimal point too)
  const rowBlobs = cand.filter(c => c.y0 >= ry0 - rH * 0.1 && c.y1 <= ry1 + rH * 0.1 && c.x0 >= gx0 - 1 && c.x1 <= gx1 + 1);

  // 6. italic slant: the shear that makes the column projection peakiest
  const pix = []; for (const c of rowBlobs) for (const p of c.px) pix.push(p);
  const by = ry1;
  let t = 0, bestScore = -1;
  for (let tt = 0.12; tt <= 0.3; tt += 0.02) {
    const proj = new Map();
    for (const p of pix) { const X = Math.round(p % W - (by - ((p / W) | 0)) * tt); proj.set(X, (proj.get(X) || 0) + 1); }
    let s = 0; for (const v of proj.values()) s += v * v;
    if (s > bestScore) { bestScore = s; t = tt; }
  }
  const shx = p => p % W - (by - ((p / W) | 0)) * t;
  const sx = pix.map(shx);
  const [sxMin, sxMax] = minMax(sx);
  const minX = Math.floor(sxMin);
  const RW = Math.ceil(sxMax) - minX + 2;
  const row = new Uint8Array(RW * rH);
  for (let i = 0; i < pix.length; i++) {
    const X = Math.round(sx[i] - minX), Y = ((pix[i] / W) | 0) - ry0;
    if (Y >= 0 && Y < rH) { row[Y * RW + X] = 1; row[Y * RW + X + 1] = 1; }
  }

  // split glyphs on the upper 80% only, so the decimal point (at the bottom)
  // never bridges two digits
  const col = new Array(RW).fill(0);
  for (let y = 0; y < Math.round(rH * 0.8); y++) for (let x = 0; x < RW; x++) col[x] += row[y * RW + x];
  const runs = []; let s0 = -1;
  for (let x = 0; x <= RW; x++) {
    const on = x < RW && col[x] > 0;
    if (on && s0 < 0) s0 = x;
    if (!on && s0 >= 0) { runs.push([s0, x - 1]); s0 = -1; }
  }
  const mg = [];
  for (const rr of runs) { const L = mg[mg.length - 1]; if (L && rr[0] - L[1] - 1 < Math.max(2, rH * 0.05)) L[1] = rr[1]; else mg.push([...rr]); }
  const glyphs = mg
    .filter(([a, b]) => { let n = 0; for (let x = a; x <= b; x++) n += col[x]; return n > rH * 0.5; })
    .map(([a, b]) => {
      const w = b - a + 1; const bm = new Uint8Array(w * rH);
      for (let y = 0; y < rH; y++) for (let x = 0; x < w; x++) bm[y * w + x] = row[y * RW + a + x];
      return { bm, w, h: rH, a, b };
    });
  if (!glyphs.length) return { ok: false, reason: 'no digits found on the LCD' };

  // A lit horizontal segment broken by glare splits one digit into two narrow
  // pieces (2026-10-27: a clear "0.0" read as "01.1"). Re-join two adjacent
  // narrow pieces only when a top or bottom segment really bridges the gap and
  // the joined glyph is a normal-width digit other than 1. Two real 1s never
  // join: nothing lies between them.
  for (let i = 0; i + 1 < glyphs.length; i++) {
    const A = glyphs[i], B = glyphs[i + 1];
    if (A.w >= rH * 0.34 || B.w >= rH * 0.34) continue;
    const w = B.b - A.a + 1;
    if (w > rH * 0.75 || w < rH * 0.4) continue;
    // share of gap columns crossed by a mark in the top or bottom band
    const band = (y0, y1) => { let n = 0, on = 0; for (let x = A.b + 1; x < B.a; x++) { n++; for (let y = y0; y < y1; y++) if (row[y * RW + x]) { on++; break; } } return n ? on / n : 1; };
    if (band(0, Math.ceil(rH * 0.18)) < 0.85 && band(Math.floor(rH * 0.82), rH) < 0.85) continue;
    const bm = new Uint8Array(w * rH);
    for (let y = 0; y < rH; y++) for (let x = 0; x < w; x++) bm[y * w + x] = row[y * RW + A.a + x];
    const m = { bm, w, h: rH, a: A.a, b: B.b };
    const c = classify(m);
    // b c d e f lit, a lost to the same glare that split it: on a seven-segment
    // display that can only be a 0 (segment g is still checked for faintness below)
    if (c.d === '?' && c.bits.join('') === '0111110') m.zeroNoTop = true;
    else if (c.d === '?' || c.d === '1') continue;
    glyphs.splice(i, 2, m);
  }
  const out = glyphs.map(q => (q.zeroNoTop ? { d: '0', bits: [1, 1, 1, 1, 1, 1, 0] } : classify(q)));

  // decimal point: marks in the bottom 30% of a gap between two glyphs.
  // A small or faint point (2026-10-27: "70.5" read as "705") is still taken
  // when it is the only mark in any gap: every other gap must be empty.
  let decimalAfter = -1, bestDot = 0;
  const gapDots = [];
  for (let i = 0; i + 1 < glyphs.length; i++) {
    let n = 0;
    for (let y = Math.floor(rH * 0.7); y < rH; y++) for (let x = glyphs[i].b + 1; x < glyphs[i + 1].a; x++) n += row[y * RW + x];
    gapDots.push(n);
    if (n > bestDot && n >= rH * rH * 0.004) { bestDot = n; decimalAfter = i + 1; }
  }
  if (decimalAfter < 0 && gapDots.length) {
    const best = Math.max(...gapDots), at = gapDots.indexOf(best);
    if (best >= rH * rH * 0.0025 && gapDots.every((n, i) => i === at || n <= best * 0.1)) decimalAfter = at + 1;
  }
  let digs = out.map(o => o.d);
  // the "k" of "km" sometimes survives as a trailing glyph
  let kDropped = false;
  if (digs.length > 1 && digs[digs.length - 1] === '?' && out[out.length - 1].k) { digs.pop(); kDropped = true; }
  // exactly one digit follows the point; anything after it is the "km" label
  if (decimalAfter > 0 && digs.length > decimalAfter + 1) digs = digs.slice(0, decimalAfter + 1);
  let text = digs.join('');
  if (decimalAfter > 0 && decimalAfter < digs.length) text = text.slice(0, decimalAfter) + '.' + text.slice(decimalAfter);

  // SAFETY 1: a segment called "off" must really be blank. A faint-but-lit
  // segment (glare, angle) silently turns 7 into 1 or 8 into 0, so sample the
  // raw brightness under every off segment and refuse if it is dark.
  const wide = out.slice(0, digs.length).map((o, i) => (o.d !== '1' ? glyphs[i].w : 0)).filter(Boolean);
  const cellW = wide.length ? Math.max(...wide) : rH * 0.55;
  const rawRatio = (X0, X1, Y0, Y1) => { // deskewed row coords -> image
    let s = 0, n = 0;
    for (let Y = Math.floor(Y0); Y < Math.ceil(Y1); Y++) for (let X = Math.floor(X0); X < Math.ceil(X1); X++) {
      const y = ry0 + Y, x = Math.round(X + minX + (by - y) * t);
      if (x < 0 || y < 0 || x >= W || y >= H || !region[y * W + x]) continue;
      s += V[y * W + x] / bgAt(x, y); n++;
    }
    return n ? s / n : 1;
  };
  let faint = null;
  out.forEach((o, i) => {
    if (i >= digs.length || o.d === '?' || faint) return;
    const q = glyphs[i];
    // a "1" occupies only the right of its cell: probe the full cell
    const x0 = o.d === '1' ? q.b - cellW + 1 : q.a, w = o.d === '1' ? cellW : q.w;
    o.bits.forEach((on, k) => {
      if (on || faint) return;
      const [fx0, fx1, fy0, fy1] = SEGBOX[k];
      const rr = rawRatio(x0 + fx0 * w + w * 0.1, x0 + fx1 * w - w * 0.1, fy0 * rH + rH * 0.02, fy1 * rH - rH * 0.02);
      if (rr < 0.9) faint = { glyph: i, seg: 'abcdefg'[k], r: +rr.toFixed(2) };
    });
  });

  // SAFETY 2: a leading digit we failed to pick up turns 651.3 into 1.3.
  // Refuse when anything unexplained sits just left of the reading on the same
  // row, when glare has blanked part of the row, or when the LCD does not
  // continue to the left (frame edge / dial may hide digits).
  const leftZone = gx0 - rH * 2.5;
  const stray = cand.some(c => c.x1 < gx0 && c.x1 > leftZone && c.h >= rH * 0.25 &&
    (Math.min(c.y1, ry1) - Math.max(c.y0, ry0)) >= Math.min(c.h, rH) * 0.5);
  let holes = 0;
  for (let y = ry0; y <= ry1; y++)
    for (let x = Math.max(lcd.x0, Math.round(leftZone)); x <= gx1; x++) if (rowReg[y * W + x] && !region[y * W + x]) holes++;
  let inside = 0, total = 0;
  for (let y = ry0; y <= ry1; y += 2) for (let x = Math.round(leftZone); x < gx0; x += 2) { total++; if (x >= 0 && region[y * W + x]) inside++; }

  let ok = /^(0|[1-9]\d{0,3})\.\d$/.test(text);
  let reason;
  // Odometer hubs (Rawalpindi Gulraiz / Bahria) show a whole number, no point.
  // Accepted only when asked for, and never when the "k" of "km" was just
  // dropped and a "1" is left at the end: the k's upright stroke can itself
  // read as a "1", turning 41477 into 414771.
  if (!ok && opts.integer && decimalAfter < 0 && /^[1-9]\d{2,6}$/.test(text)) {
    ok = !(kDropped && text.endsWith('1'));
    if (!ok) reason = `"${text}": trailing 1 may be the k of "km" — ambiguous`;
  }
  if (!ok) reason = reason || `could not read every digit (saw "${text}")`;
  else if (stray) { ok = false; reason = `unexplained mark left of "${text}" — a digit may be missing`; }
  else if (holes > rH * rH * 0.15) { ok = false; reason = `glare covers part of the reading "${text}"`; }
  else if (faint) { ok = false; reason = `"${text}": segment ${faint.seg} of digit ${faint.glyph + 1} is faint — ambiguous`; }
  // A full 6-digit odometer (2026-10-28: Bahria 119711) fills the LCD to its
  // left edge, yet no digit can be hidden in front of it: 6 is the most there are.
  else if (total > 0 && inside / total < 0.85 && !(opts.integer && /^\d{6}$/.test(text))) { ok = false; reason = `"${text}" is at the edge of the visible LCD`; }
  return { ok, reason, text, rotated: 0 };
}

function classify(q) {
  const { bm, w, h } = q;
  let fill = 0; for (let i = 0; i < bm.length; i++) fill += bm[i]; fill /= bm.length;
  if (fill > 0.7) return { d: '?', bits: [0, 0, 0, 0, 0, 0, 0] }; // solid block (fuel bar), not a digit
  if (w < h * 0.34) return { d: '1', bits: [0, 1, 1, 0, 0, 0, 0] };
  const frac = (fx0, fx1, fy0, fy1) => {
    let on = 0, n = 0;
    for (let y = Math.floor(fy0 * h); y < Math.ceil(fy1 * h); y++)
      for (let x = Math.floor(fx0 * w); x < Math.ceil(fx1 * w); x++) { n++; on += bm[y * w + x] ? 1 : 0; }
    return n ? on / n : 0;
  };
  const bits = SEGBOX.map(b => (frac(...b) > 0.18 ? 1 : 0));
  let d = '?';
  for (const [digit, p] of Object.entries(PATTERNS)) if (p.every((v, i) => v === bits[i])) d = digit;
  return { d, bits, k: !bits[0] && !bits[1] };
}

// ─── Public entry point ───────────────────────────────────────────────────────
// Two passes at different scales fail in different ways, so a reading is only
// accepted when they agree. Returns { ok, km, text, reason }.
// opts.integer: also accept a whole-number odometer reading (odometer hubs).
// A pale, washed-out LCD (2026-10-27: a clear "282.6" read as "2") has lit
// segments only a little darker than the backlight, so a failed read is
// retried with looser darkness thresholds [weak, strong]. Every safety check
// and the two-scale agreement apply to each try; the first agreed reading wins.
const CONTRAST = [[0.8, 0.72], [0.88, 0.8], [0.9, 0.84], [0.93, 0.88]];
// A yellower backlight (2026-11-03: G-13's clear "0.0", hue 59) fell outside
// the amber band, so the orange dash glow was taken for the LCD. The wider
// band is tried only after the normal one fails: widening it outright lost a
// good "142.4" on 120 live photos.
const HUE_MAX = [55, 62];
async function readAt(buf, integer, weak, strong, hueMax) {
  const a = await readLcd(buf, { target: 900, integer, weak, strong, hueMax });
  if (!a.ok) return a;
  for (const target of [650, 1200]) {
    const b = await readLcd(buf, { target, integer, weak, strong, hueMax });
    if (b.ok && b.text === a.text) return { ok: true, km: parseFloat(a.text), text: a.text };
  }
  return { ok: false, reason: `"${a.text}" was not confirmed by a second pass`, text: a.text };
}
async function readMeter(buf, opts = {}) {
  const integer = !!opts.integer;
  let first;
  for (const hueMax of HUE_MAX) {
    for (const [weak, strong] of CONTRAST) {
      const r = await readAt(buf, integer, weak, strong, hueMax);
      if (r.ok) return r;
      if (!first) first = r; // the normal-contrast reason is the most useful one to log
      if (/no amber LCD/.test(r.reason)) break; // no LCD at all: nothing to retry
    }
  }
  return first;
}

module.exports = { readMeter };
