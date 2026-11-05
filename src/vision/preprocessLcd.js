// ─── Preprocess a dashboard photo to isolate the odometer LCD for OCR ─────────
// Real meter photos are hard for Tesseract: the reading sits in a small amber/
// orange backlit LCD, surrounded by an analog speedo dial (80/100/120/140) that
// Tesseract reads MORE easily — so it grabs a dial number instead of the reading.
//
// The LCD is a big SOLID amber rectangle. Other orange things in frame (a sponge,
// a warning light) are smaller. So we find the LARGEST connected amber blob and
// crop to it — this reliably lands on the LCD and excludes the dial. Then upscale
// + grayscale + contrast + threshold so the dark 7-seg digits pop as black-on-white.

const Jimp = require('jimp');

function isAmber(r, g, b) {
  // amber/orange backlight: strong red, moderate green, low blue
  return r > 150 && g > 55 && g < 220 && b < 145 && (r - b) > 55 && (r - g) > 15;
}

// Largest connected component (4-conn) of the amber mask → its bounding box.
function largestAmberBox(mask, width, height) {
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let best = null;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    visited[start] = 1;
    let count = 0, minX = width, minY = height, maxX = 0, maxY = 0;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % width;
      const y = (p - x) / width;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // 4 neighbours
      if (x > 0) { const n = p - 1; if (mask[n] && !visited[n]) { visited[n] = 1; stack[sp++] = n; } }
      if (x < width - 1) { const n = p + 1; if (mask[n] && !visited[n]) { visited[n] = 1; stack[sp++] = n; } }
      if (y > 0) { const n = p - width; if (mask[n] && !visited[n]) { visited[n] = 1; stack[sp++] = n; } }
      if (y < height - 1) { const n = p + width; if (mask[n] && !visited[n]) { visited[n] = 1; stack[sp++] = n; } }
    }
    if (!best || count > best.count) best = { count, minX, minY, maxX, maxY };
  }
  return best;
}

async function preprocessForOdometer(imageBuffer) {
  const img = await Jimp.read(imageBuffer);
  const { width, height } = img.bitmap;

  // Build amber mask.
  const mask = new Uint8Array(width * height);
  let amberCount = 0;
  img.scan(0, 0, width, height, function (x, y, idx) {
    const r = this.bitmap.data[idx];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    if (isAmber(r, g, b)) { mask[y * width + x] = 1; amberCount++; }
  });

  let region = img;
  let cropped = false;
  if (amberCount > width * height * 0.001) {
    const box = largestAmberBox(mask, width, height);
    if (box) {
      const boxW = box.maxX - box.minX;
      const boxH = box.maxY - box.minY;
      // the LCD blob should be a decent-sized chunk of the frame
      if (box.count > width * height * 0.006 && boxW > 40 && boxH > 18) {
        const padX = Math.round(boxW * 0.06);
        const padY = Math.round(boxH * 0.30);
        const cx = Math.max(0, box.minX - padX);
        const cy = Math.max(0, box.minY - padY);
        const cw = Math.min(width - cx, boxW + padX * 2);
        const ch = Math.min(height - cy, boxH + padY * 2);
        region = img.clone().crop(cx, cy, cw, ch);
        cropped = true;
      }
    }
  }

  // Enhance for OCR: upscale, then ADAPTIVE threshold (handles glare gradient).
  if (region.bitmap.width < 1000) region.resize(1000, Jimp.AUTO);
  const W = region.bitmap.width, H = region.bitmap.height, d = region.bitmap.data;

  // Intensity = red channel: amber background is bright red, dark 7-seg digits
  // are low — better separation than luminance for an amber LCD.
  const inten = new Float64Array(W * H);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) inten[p] = d[i];

  // Integral image for fast local means.
  const integ = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let rowsum = 0;
    for (let x = 0; x < W; x++) {
      rowsum += inten[y * W + x];
      integ[(y + 1) * (W + 1) + (x + 1)] = integ[y * (W + 1) + (x + 1)] + rowsum;
    }
  }
  const boxMean = (x0, y0, x1, y1) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    const area = (x1 - x0 + 1) * (y1 - y0 + 1);
    const s = integ[(y1 + 1) * (W + 1) + (x1 + 1)] - integ[y0 * (W + 1) + (x1 + 1)]
      - integ[(y1 + 1) * (W + 1) + x0] + integ[y0 * (W + 1) + x0];
    return s / area;
  };

  const win = Math.max(15, Math.round(W * 0.10)); // local window ~10% of width
  const C = 12; // pixel must be this much below local mean to count as ink
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const mean = boxMean(x - win, y - win, x + win, y + win);
      const nv = inten[p] < mean - C ? 0 : 255; // dark digit → black, else white
      const i = p * 4;
      d[i] = nv; d[i + 1] = nv; d[i + 2] = nv; d[i + 3] = 255;
    }
  }

  const buffer = await region.getBufferAsync(Jimp.MIME_PNG);
  return { buffer, cropped };
}

module.exports = { preprocessForOdometer };
