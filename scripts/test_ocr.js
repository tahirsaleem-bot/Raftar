// Offline OCR tuning harness — runs the preprocessing + OCR on a saved image
// and writes the intermediate cropped/binarized image so we can inspect it.
// Usage: node scripts/test_ocr.js output/meter_debug/<file>.jpg
const fs = require('fs');
const path = require('path');
const { preprocessForOdometer } = require('../src/vision/preprocessLcd');
const { extractKMFromImage } = require('../src/vision/extractKM');

(async () => {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error('give a valid image path'); process.exit(1);
  }
  const buf = fs.readFileSync(file);

  // 1) Dump the preprocessed image for visual inspection.
  try {
    const pre = await preprocessForOdometer(buf);
    const outDir = path.join(__dirname, '../output/meter_debug');
    fs.mkdirSync(outDir, { recursive: true });
    const preFile = path.join(outDir, '_preprocessed.png');
    fs.writeFileSync(preFile, pre.buffer);
    console.log(`cropped=${pre.cropped}  preprocessed → ${preFile}`);
  } catch (e) {
    console.error('preprocess error:', e.message);
  }

  // 2) Run the full extractor.
  const res = await extractKMFromImage(buf, 'TEST');
  console.log('RESULT:', JSON.stringify(res));
  process.exit(0);
})();
