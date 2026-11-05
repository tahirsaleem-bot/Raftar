// After Section 1 submitted, explore Section 2 (People Competencies) of the Upward appraisal.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const BASE = process.env.MARKAZ_URL || 'https://markaz.taleemabad.com/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function clickByText(page, regex, tags = 'a,button,[role=menuitem],[role=button],[role=tab],div,span,li') {
  const rect = await page.evaluate((sel, src) => {
    const re = new RegExp(src, 'i');
    const cands = [...document.querySelectorAll(sel)]
      .filter(e => re.test((e.innerText || '').trim()))
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
    const el = cands[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, tags, regex.source || regex);
  if (rect) { await page.mouse.click(rect.x, rect.y); }
  return !!rect;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false, userDataDir: SESSION_DIR, defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
  });
  const page = (await browser.pages())[0] || await browser.newPage();

  await page.goto(BASE + 'appraisals', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);
  await clickByText(page, /appraisal assessment/i);
  await sleep(2500);
  await clickByText(page, /upward/i);
  await sleep(3500);

  // Scroll to bottom to load Section 2
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollBy(0, 600); await new Promise(r=>setTimeout(r,200)); }
  });
  await sleep(2000);

  const full = await page.evaluate(() => {
    const text = document.body.innerText.split('\n').map(s=>s.trim()).filter(Boolean);
    const combos = [...document.querySelectorAll('button[role=combobox]')].map(c=>(c.innerText||'').trim());
    const textareas = [...document.querySelectorAll('textarea')].map(t=>t.placeholder||'');
    const inputs = [...document.querySelectorAll('input')].map(i=>({type:i.type, ph:i.placeholder||'', name:i.name||''}));
    const buttons = [...document.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).filter(Boolean);
    return { combos, textareas, inputs, buttons, text };
  });
  console.log('=== COMBOS ===', JSON.stringify(full.combos));
  console.log('=== TEXTAREAS ===', JSON.stringify(full.textareas));
  console.log('=== INPUTS ===', JSON.stringify(full.inputs));
  console.log('=== BUTTONS ===', JSON.stringify([...new Set(full.buttons)]));
  console.log('\n=== BODY TEXT ===');
  full.text.forEach(t => console.log('  ', t));

  await page.screenshot({ path: 'output/section2_full.png', fullPage: true });
  console.log('\nScreenshot: output/section2_full.png. Browser open.');
  await new Promise(() => {});
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
