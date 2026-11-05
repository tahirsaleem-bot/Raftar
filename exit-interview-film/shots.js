// Screenshots of the real app, one per step the film walks through, each with a ring drawn
// around the control the narration is talking about.
//
// The ring is injected into the live page and measured from the element's own bounding box,
// so it lands on the button wherever the layout puts it - never on coordinates guessed from
// the CSS. Shot at a phone width, because that is where this app is used.
const path = require('path');
const fs = require('fs');
const pp = require('C:/Raftar/exit-interview-agent/node_modules/puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8750';
const OUT = path.join(__dirname, 'shots');
const W = 900, H = 1500;   // tall phone-ish: the whole card fits without scrolling

// Each shot: where to go, what to click first, what to ring, and how far down to scroll.
const SHOTS = [
  { id: 'counters', ring: null, scroll: 0, clipTo: '.rail',
    why: 'the four counters and the register button, big enough to read' },
  { id: 'list', ring: null, scroll: 0,
    why: 'the whole desk - what is on you, what is waiting, what is done' },
  { id: 'schedule', ring: '.card.s-new .btn-primary', scroll: '.card.s-new', clipTo: '.card.s-new',
    why: 'the new case, with Send invite ringed' },
  { id: 'review', ring: '.card.s-review .btn-primary', scroll: '.card.s-review', clipTo: '.card.s-review',
    why: 'the drafted record, with File and send ringed' },
  { id: 'edit', ring: '.card.s-review button[onclick^="openEditor"]', scroll: '.card.s-review', clipTo: '.card.s-review',
    why: 'Edit the wording, beside Read the draft' },
  { id: 'recipients', ring: '#cc-demo-review', scroll: '.card.s-review', clipTo: '.card.s-review',
    why: 'the reply-all list, editable before sending' },
  { id: 'register', click: '#regBtn', ring: null, scroll: 0, settle: 1200, clipRect: { x: 0, y: 0, width: 900, height: 470 },
    why: 'the register, open' },
];

const RING_CSS = `
  .shot-ring { position:absolute; z-index:9999; border:5px solid #c9922e; border-radius:999px;
               box-shadow:0 0 0 6px rgba(201,146,46,.22), 0 10px 30px rgba(0,0,0,.18);
               pointer-events:none; }
  .shot-dim  { position:fixed; inset:0; z-index:9998; background:rgba(10,24,40,.30);
               pointer-events:none; }`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const meta = {};
  const browser = await pp.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  // The demo server has no sign-in configured (`/health` says login: none), but the page
  // still puts its gate up when it finds no stored credential. Seed one so the shots show
  // the desk rather than the login screen.
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('exit_session', 'demo'); localStorage.setItem('pin', 'demo'); } catch (e) {}
  });

  for (const s of SHOTS) {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 1400));          // let the cases land

    if (s.click) {
      await page.click(s.click);
      await new Promise(r => setTimeout(r, s.settle || 800));
    }
    if (typeof s.scroll === 'string') {
      await page.evaluate(sel => {
        const el = document.querySelector(sel);
        if (el) el.scrollIntoView({ block: 'center' });
      }, s.scroll);
      await new Promise(r => setTimeout(r, 400));
    }

    let ringBox = null;
    const ringed = s.ring ? await page.evaluate((sel, css) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
      document.body.insertAdjacentHTML('beforeend', '<div class="shot-dim"></div>');
      const r = el.getBoundingClientRect();
      const pad = 10;
      const d = document.createElement('div');
      d.className = 'shot-ring';
      d.style.left = (r.left + window.scrollX - pad) + 'px';
      d.style.top = (r.top + window.scrollY - pad) + 'px';
      d.style.width = (r.width + pad * 2) + 'px';
      d.style.height = (r.height + pad * 2) + 'px';
      // The ringed control sits above the dim, so it stays bright.
      el.style.position = 'relative'; el.style.zIndex = '9999';
      document.body.appendChild(d);
      return { left: r.left + window.scrollX, top: r.top + window.scrollY,
               width: r.width, height: r.height };
    }, s.ring, RING_CSS) : null;
    ringBox = ringed;

    if (s.ring && !ringed) console.log(`  !! ${s.id}: nothing matched ${s.ring}`);
    const file = path.join(OUT, s.id + '.png');
    // Clip to the card the step is about: a full page with three cards in it reads as
    // clutter on screen, and the narration is only ever talking about one of them.
    let clip = s.clipRect || null;
    if (s.clipTo) {
      clip = await page.evaluate(sel => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const pad = 26;
        // page coordinates, not viewport: the page has been scrolled by now, and
        // screenshot({clip}) measures from the top of the document.
        return { x: Math.max(0, r.left + window.scrollX - pad), y: Math.max(0, r.top + window.scrollY - pad),
                 width: r.width + pad * 2, height: r.height + pad * 2 };
      }, s.clipTo);
    }
    await page.screenshot(clip ? { path: file, clip } : { path: file });

    // Where the ring sits inside the image that was just written, as fractions. The film
    // uses this to move the camera onto the control rather than drifting at random.
    const box = clip || { x: 0, y: 0, width: W, height: H };
    meta[s.id] = {
      file: s.id + '.png', width: Math.round(box.width), height: Math.round(box.height),
      ring: ringBox ? {
        x: +(((ringBox.left - box.x) + ringBox.width / 2) / box.width).toFixed(4),
        y: +(((ringBox.top - box.y) + ringBox.height / 2) / box.height).toFixed(4),
        w: +(ringBox.width / box.width).toFixed(4),
        h: +(ringBox.height / box.height).toFixed(4),
      } : null,
    };
    console.log(`  ${s.id.padEnd(11)} ${s.why}`);
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(meta, null, 2));
  console.log('\nwrote shots.json with ring positions');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
