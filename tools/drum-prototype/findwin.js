// locate the drum odometer window: a dark, wide rectangle inside the bright dial
const Jimp = require('C:/Raftar/ai-agent-starter/node_modules/jimp');
const fs = require('fs');
const S = 'C:/Users/tahir/AppData/Local/Temp/claude/c39612e77a1026af/92786cf6-c62a-471b-9f82-ffbe874c29b7/scratchpad';
function comps(mask, W, H) {
  const lab = new Int32Array(W * H).fill(-1), out = [];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const st = [s]; lab[s] = out.length; let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    while (st.length) { const p = st.pop(); n++; const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - W, p + W]) if (q >= 0 && q < W * H && mask[q] && lab[q] < 0 && Math.abs((q % W) - x) <= 1) { lab[q] = out.length; st.push(q); } }
    out.push({ n, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return out;
}
async function find(file) {
  const img = await Jimp.read(file); const k = 800 / img.bitmap.width; img.resize(800, Jimp.AUTO);
  const W = img.bitmap.width, H = img.bitmap.height, D = img.bitmap.data;
  const L = new Float32Array(W * H); for (let i = 0; i < W * H; i++) L[i] = (D[i*4] + D[i*4+1] + D[i*4+2]) / 3;
  const dark = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) dark[i] = L[i] < 90 ? 1 : 0;
  const cs = comps(dark, W, H).filter(c => c.w > 50 && c.w < 300 && c.w / c.h > 2.5 && c.w / c.h < 6 && c.n > 0.5 * c.w * c.h);
  // surrounded by bright dial
  const ring = c => { let s = 0, n = 0; for (let x = c.x0; x <= c.x1; x++) for (const y of [c.y0 - 6, c.y1 + 6]) if (y >= 0 && y < H) { s += L[y * W + x]; n++; } return s / n; };
  const sc = cs.map(c => ({ ...c, ring: ring(c) })).filter(c => c.ring > 140).sort((a, b) => b.n - a.n);
  return { cand: sc, k };
}
(async () => {
  for (const f of fs.readdirSync(S + '/gul').filter(f => f.endsWith('.jpg'))) {
    const { cand, k } = await find(S + '/gul/' + f); const c = cand[0];
    console.log(f, cand.length, c ? `${c.x0},${c.y0} ${c.w}x${c.h} ring=${c.ring|0}` : 'none');
    if (c) { const im = await Jimp.read(S + '/gul/' + f); const kk = im.bitmap.width / 800; im.crop(Math.round(c.x0*kk), Math.round(c.y0*kk), Math.round(c.w*kk), Math.round(c.h*kk)).resize(400, Jimp.AUTO); await im.writeAsync(S + '/crops/' + f.replace('.jpg', '.png')); }
  }
})();
