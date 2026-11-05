// Open Radix Select comboboxes via real element clicks and read [role=option].
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function readOptions(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role=option]')].map(o => (o.innerText || '').trim()).filter(Boolean));
}

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
  console.log('combobox count:', combos.length);

  // First combobox = manager
  await combos[0].click();
  await sleep(1200);
  console.log('MANAGER OPTIONS:', JSON.stringify(await readOptions(page), null, 1));
  await page.keyboard.press('Escape'); await sleep(600);

  // Second combobox = first rating row
  const combos2 = await page.$$('button[role=combobox]');
  await combos2[1].click();
  await sleep(1200);
  console.log('RATING OPTIONS:', JSON.stringify(await readOptions(page), null, 1));
  await page.keyboard.press('Escape');

  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
