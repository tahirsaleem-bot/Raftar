// stroke profile of a digit cell: which sides have a bright stroke at 30%, 50%, 70% of the digit height
const CW = 22, CH = 34, PAD = 3, WW = 28, HH = 40;
function profile(v) {
  // Otsu-free: threshold at midpoint of 10th/95th percentiles within the centre area
  const vals = []; for (let y = PAD; y < HH - PAD; y++) for (let x = PAD; x < WW - PAD; x++) vals.push(v[y * WW + x]); vals.sort((a, b) => a - b);
  const th = (vals[Math.floor(vals.length * 0.1)] + vals[Math.floor(vals.length * 0.95)]) / 2;
  // digit vertical extent
  let y0 = HH, y1 = -1, x0 = WW, x1 = -1;
  for (let y = 0; y < HH; y++) for (let x = 0; x < WW; x++) if (v[y * WW + x] > th) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  if (y1 < 0) return null;
  const xm = (x0 + x1) / 2, out = [];
  for (const f of [0.3, 0.5, 0.7]) {
    const yc = Math.round(y0 + (y1 - y0) * f);
    let L = 0, R = 0, M = 0;
    for (let y = yc - 1; y <= yc + 1; y++) for (let x = x0; x <= x1; x++) if (v[y * WW + x] > th) {
      const r = (x - x0) / Math.max(1, x1 - x0);
      if (r < 0.3) L++; else if (r > 0.7) R++; else M++;
    }
    out.push((L >= 2 ? 'L' : '') + (M >= 3 ? 'M' : '') + (R >= 2 ? 'R' : ''));
  }
  return out.join(' ');
}
module.exports = { profile };
