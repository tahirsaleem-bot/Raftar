// Open Self Assessment form, then read the manager + rating dropdown options.
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
    const btn = [...document.querySelectorAll('button, a, [role=button]')]
      .find(b => /self assessment/i.test((b.innerText || '')));
    if (btn) btn.click();
  });
  await sleep(3500);

  // Native selects?
  const selects = await page.evaluate(() =>
    [...document.querySelectorAll('select')].map(s => ({
      name: s.name || s.id, options: [...s.options].map(o => o.text.trim()) })));
  console.log('NATIVE SELECTS:', JSON.stringify(selects, null, 1));

  // Try opening the manager combobox (first combobox-like control) to read listbox options.
  async function openAndRead(matchText) {
    const opened = await page.evaluate((mt) => {
      const el = [...document.querySelectorAll('button, [role=combobox], [role=button], div')]
        .find(e => new RegExp(mt, 'i').test((e.innerText || '').trim()) && (e.innerText||'').trim().length < 40);
      if (el) { el.click(); return true; }
      return false;
    }, matchText);
    await sleep(1200);
    const opts = await page.evaluate(() => {
      const items = [...document.querySelectorAll('[role=option], [role=menuitem], li, [data-value]')]
        .map(o => (o.innerText || '').trim()).filter(t => t && t.length < 60);
      return [...new Set(items)];
    });
    // close
    await page.keyboard.press('Escape').catch(()=>{});
    await sleep(500);
    return { opened, opts };
  }

  const mgr = await openAndRead('Select your manager');
  console.log('\nMANAGER DROPDOWN opened=' + mgr.opened + ':', JSON.stringify(mgr.opts, null, 1));

  const rating = await openAndRead('Select rating');
  console.log('\nRATING DROPDOWN opened=' + rating.opened + ':', JSON.stringify(rating.opts, null, 1));

  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
