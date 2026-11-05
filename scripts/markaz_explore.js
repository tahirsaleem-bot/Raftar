// Reuse saved session; open "People and Culture" and find People Analyzer.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');

const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function dumpItems(page, label) {
  const items = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a, button, [role=menuitem], [role=button]').forEach(e => {
      const t = (e.innerText || '').trim().split('\n')[0];
      const href = e.getAttribute('href') || '';
      if (t && t.length < 50) out.push({ t, href });
    });
    const seen = new Set();
    return out.filter(x => { const k = x.t + x.href; if (seen.has(k)) return false; seen.add(k); return true; });
  });
  console.log(`\n[${label}] (${items.length}):`);
  items.forEach(i => console.log('  -', JSON.stringify(i)));
  return items;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', userDataDir: SESSION_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.goto((process.env.MARKAZ_URL || 'https://markaz.taleemabad.com/') + 'my-profile',
    { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);

  // Find the bounding box of the "People and Culture" nav entry and click its center.
  const box = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('a, button, div, span, li')]
      .filter(e => (e.innerText || '').trim() === 'People and Culture');
    // pick the smallest element that exactly matches (the label/button itself)
    candidates.sort((a, b) => (a.getBoundingClientRect().height) - (b.getBoundingClientRect().height));
    const el = candidates[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  console.log('People and Culture box:', JSON.stringify(box));
  if (box) {
    await page.mouse.click(box.x, box.y);
    await sleep(2500);
  }
  console.log('URL now:', page.url());
  await dumpItems(page, 'after click');
  await page.screenshot({ path: 'output/markaz_menu.png', fullPage: true });
  console.log('\nScreenshot: output/markaz_menu.png');
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
