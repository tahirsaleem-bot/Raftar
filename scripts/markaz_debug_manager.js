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
  await sleep(1500);

  // Focus the search input and type.
  const searchSel = 'input[placeholder*="Search" i]';
  await page.waitForSelector(searchSel, { timeout: 5000 });
  await page.click(searchSel);
  await page.type(searchSel, 'Bilal', { delay: 80 });
  await sleep(3000); // wait for API results

  const res = await page.evaluate(() => {
    // The open popover (role=null div with data-state=open) holds the results.
    const pop = [...document.querySelectorAll('[data-state=open]')]
      .filter(e => /Search by name/i.test(e.innerText || '')).pop();
    const popText = pop ? pop.innerText : '(popover not found)';
    // clickable result rows inside the popover
    const rows = pop ? [...pop.querySelectorAll('*')]
      .filter(e => e.children.length === 0 && (e.innerText||'').trim().length>2)
      .map(e => ({tag:e.tagName, role:e.getAttribute('role'), t:(e.innerText||'').trim().slice(0,50)}))
      : [];
    return { popText: popText.slice(0, 600), rows: rows.slice(0, 30) };
  });
  console.log('POPOVER TEXT:\n', res.popText);
  console.log('\nROWS:', JSON.stringify(res.rows, null, 1));

  await page.screenshot({ path: 'output/markaz_manager_debug.png', fullPage: true });
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
