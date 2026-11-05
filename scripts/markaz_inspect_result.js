const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', userDataDir: SESSION_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,2000'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 2000 });
  await page.goto((process.env.MARKAZ_URL || 'https://markaz.taleemabad.com/') + 'people-analyzer',
    { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button,a,[role=button]')].find(x => /self assessment/i.test(x.innerText||''));
    if (b) b.click();
  });
  await sleep(3500);
  const combos = await page.$$('button[role=combobox]');
  await combos[0].click();
  await sleep(1200);
  const searchSel = 'input[placeholder*="Search" i]';
  await page.waitForSelector(searchSel, { timeout: 6000 });
  await page.click(searchSel);
  await page.type(searchSel, 'Bilal', { delay: 80 });
  await sleep(3000);

  const info = await page.evaluate(() => {
    const leaves = [...document.querySelectorAll('*')]
      .filter(e => e.children.length === 0 && /Muhammad Bilal Sadiq/.test(e.innerText || ''));
    const out = [];
    leaves.forEach((leaf, idx) => {
      const chain = [];
      let el = leaf;
      for (let i = 0; i < 5 && el; i++) {
        const r = el.getBoundingClientRect();
        chain.push({
          tag: el.tagName,
          role: el.getAttribute('role'),
          dataAttrs: [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => `${a.name}=${a.value}`).join(','),
          cls: (el.className || '').toString().slice(0, 50),
          box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        });
        el = el.parentElement;
      }
      out.push({ idx, text: (leaf.innerText||'').trim().slice(0,40), chain });
    });
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
