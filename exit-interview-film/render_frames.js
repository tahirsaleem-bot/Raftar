// Renders film.html frame by frame in ONE browser session: page.evaluate(render, t) then
// screenshot. About 150ms a frame, against ~1.2s if Chrome were launched per frame.
//
//   node render_frames.js            all frames into seq/
//   node render_frames.js --stills   one frame per scene into frames/, for the QA read
//   node render_frames.js 600 900    re-render that frame range only, after a fix
const path = require('path');
const fs = require('fs');
const pp = require('C:/Raftar/exit-interview-agent/node_modules/puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HERE = __dirname;
const FPS = 30;
const W = 1920, H = 1080;

(async () => {
  const stills = process.argv.includes('--stills');
  const nums = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);

  let browser = await pp.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  let page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto('file:///' + path.join(HERE, 'film.html').replace(/\\/g, '/'),
    { waitUntil: 'networkidle0' });
  // Webfonts must be in before the first screenshot or scene 1 renders in a fallback face.
  await page.evaluate(() => document.fonts.ready);

  // Scene lengths come from the real voice-over clips, not from the page.
  const tlPath = path.join(HERE, 'timeline.json');
  let film, tl = null;
  if (fs.existsSync(tlPath)) {
    tl = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
    film = await page.evaluate(x => window.setTimeline(x), tl);
    console.log('timeline: driven by the voice-over');
  } else {
    film = await page.evaluate(() => window.FILM);
  }
  console.log(`film: ${film.total.toFixed(1)}s, ${film.scenes.length} scenes`);

  if (stills) {
    const dir = path.join(HERE, 'frames');
    fs.mkdirSync(dir, { recursive: true });
    for (const s of film.scenes) {
      // 60% through the scene: past the reveal, before the crossfade out.
      const t = s.t0 + s.d * 0.6;
      await page.evaluate(x => window.render(x), t);
      const out = path.join(dir, `${s.id}.png`);
      await page.screenshot({ path: out });
      console.log(`  ${s.id} @ ${t.toFixed(2)}s -> ${path.basename(out)}`);
    }
    await browser.close();
    return;
  }

  const dir = path.join(HERE, 'seq');
  fs.mkdirSync(dir, { recursive: true });
  const total = Math.round(film.total * FPS);
  const from = nums.length ? nums[0] : 0;
  const to = nums.length > 1 ? nums[1] : total - 1;

  // This laptop often runs with well under a gigabyte free, and Chrome eventually answers
  // a screenshot with "Unable to capture screenshot" and stays broken. Rather than losing
  // the run at frame 400, the page is rebuilt and the frame retried; the renderer is a
  // pure function of t, so a fresh browser resumes exactly where it was.
  async function freshPage() {
    try { await page.close(); } catch {}
    // Under memory pressure Chrome sometimes loses the page and sometimes the whole
    // process ("Target closed", then "Connection closed"). A new page is no use when the
    // browser itself has gone, so check and relaunch it.
    if (!browser.connected) {
      console.log('  browser died — relaunching');
      try { await browser.close(); } catch {}
      browser = await pp.launch({
        executablePath: CHROME, headless: 'new',
        args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
      });
    }
    page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.goto('file:///' + path.join(HERE, 'film.html').replace(/\\/g, '/'),
      { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    if (tl) await page.evaluate(x => window.setTimeline(x), tl);
  }

  const started = Date.now();
  for (let f = from; f <= to; f++) {
    const out = path.join(dir, `f${String(f).padStart(5, '0')}.jpg`);
    let done = false;
    for (let attempt = 1; !done && attempt <= 3; attempt++) {
      try {
        await page.evaluate(t => window.render(t), f / FPS);
        await page.screenshot({ path: out, type: 'jpeg', quality: 94 });
        done = true;
      } catch (e) {
        console.log(`  frame ${f}: ${e.message.split('\n')[0]} — new page (${attempt})`);
        await new Promise(r => setTimeout(r, 1500 * attempt));
        await freshPage();
      }
    }
    if (!done) throw new Error(`frame ${f} would not render after 3 tries`);
    // A periodic fresh page keeps the renderer's memory from creeping up over
    // three thousand screenshots.
    if ((f - from + 1) % 400 === 0) await freshPage();
    if (f % 150 === 0 || f === to) {
      const done = f - from + 1, ms = (Date.now() - started) / done;
      process.stdout.write(`  ${f}/${to}  ${ms.toFixed(0)}ms/frame  eta ${(((to - f) * ms) / 1000).toFixed(0)}s\n`);
    }
  }
  await browser.close();
  console.log(`done: ${to - from + 1} frames in ${((Date.now() - started) / 1000).toFixed(0)}s`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
