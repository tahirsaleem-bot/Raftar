const J = require('C:/Raftar/ai-agent-starter/node_modules/jimp'); const fs = require('fs');
const src = fs.readFileSync('C:/Raftar/ai-agent-starter/src/vision/readDrum.js', 'utf8'); eval(src.match(/function components[\s\S]*?\n}\n/)[0]);
(async () => { for (const f of process.argv.slice(2)) {
  const img = (await J.read(f)).resize(800, J.AUTO); const W = img.bitmap.width, H = img.bitmap.height, D = img.bitmap.data; const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = (D[i * 4] + D[i * 4 + 1] + D[i * 4 + 2]) / 3;
  const so = Float32Array.from(L).sort(), dialL = so[Math.floor(so.length * .9)]; console.log(f.split('/').pop(), 'dialL', dialL.toFixed(0));
  for (const th of [Math.min(130, .58 * dialL), .45 * dialL, .36 * dialL]) { const dark = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) dark[i] = L[i] < th ? 1 : 0;
    for (let y = 0; y < H; y++) { let last = -1; for (let x = 0; x < W; x++) { const i = y * W + x; if (dark[i]) { if (last >= 0 && x - last > 1 && x - last <= 8) for (let k = last + 1; k < x; k++) dark[y * W + k] = 1; last = x; } } }
    for (const c of components(dark, W, H)) { if (!(c.w > 50 && c.w < 300 && c.w / c.h > 2.5 && c.w / c.h < 6 && c.n > .5 * c.w * c.h)) continue; let b = 0, n = 0, t = 0, rs = 0, rn = 0;
      for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) { const v = L[y * W + x]; t += v; if (v > .6 * dialL) b++; n++; }
      for (let x = c.x0; x <= c.x1; x++) for (const y of [c.y0 - 6, c.y1 + 6]) if (y >= 0 && y < H) { rs += L[y * W + x]; rn++; }
      console.log(' th', th.toFixed(0), c.x0, c.y0, c.w, c.h, 'mean', (t / n).toFixed(0), 'bf', (b / n).toFixed(2), 'ring', (rs / rn).toFixed(0)); } } } })();
