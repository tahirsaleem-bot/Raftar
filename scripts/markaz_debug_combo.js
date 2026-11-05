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
  console.log('count', combos.length);

  // Open RATING (index 1) — static options, good for debugging.
  await combos[1].focus();
  await combos[1].click();
  await sleep(800);
  // If not open, try keyboard
  let opened = await page.evaluate(() => document.querySelectorAll('[role=option]').length);
  console.log('after click, options:', opened);
  if (!opened) {
    await page.keyboard.press('ArrowDown'); await sleep(400);
    await page.keyboard.press('Enter'); await sleep(400);
    opened = await page.evaluate(() => document.querySelectorAll('[role=option]').length);
    console.log('after key, options:', opened);
  }

  const dump = await page.evaluate(() => {
    const states = [...document.querySelectorAll('[data-state]')].map(e => ({tag:e.tagName, ds:e.getAttribute('data-state'), role:e.getAttribute('role'), t:(e.innerText||'').slice(0,30)})).filter(x=>x.ds==='open');
    const opts = [...document.querySelectorAll('[role=option]')].map(o => o.innerText.trim());
    const listboxes = [...document.querySelectorAll('[role=listbox]')].map(l => l.innerText.slice(0,200));
    return { openStates: states, opts, listboxes };
  });
  console.log('DUMP:', JSON.stringify(dump, null, 1));
  await page.screenshot({ path: 'output/markaz_combo_debug.png', fullPage: true });
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
