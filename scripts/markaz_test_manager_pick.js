const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function triggerText(page) {
  return page.evaluate(() => {
    const c = document.querySelector('button[role=combobox]');
    return c ? (c.innerText || '').trim() : '(none)';
  });
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
  await combos[0].click();
  await sleep(1200);
  const searchSel = 'input[placeholder*="Search" i]';
  await page.waitForSelector(searchSel, { timeout: 6000 });
  await page.click(searchSel);
  await page.type(searchSel, 'Bilal', { delay: 80 });
  await sleep(3000);

  // Approach 1: real mouse click on the EXACT-match result (not the card behind modal).
  const rect = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')]
      .filter(e => (e.innerText || '').trim() === 'Muhammad Bilal Sadiq')
      .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, found: 1 };
  });
  console.log('result rect:', JSON.stringify(rect));
  if (rect) {
    await page.mouse.click(rect.x, rect.y);
    await sleep(1200);
  }
  console.log('After MOUSE click, trigger:', await triggerText(page));

  // If not selected, Approach 2: keyboard ArrowDown + Enter.
  let tt = await triggerText(page);
  if (!/Bilal/.test(tt)) {
    console.log('Trying keyboard ArrowDown+Enter...');
    // reopen if needed
    const stillOpen = await page.$('input[placeholder*="Search" i]');
    if (!stillOpen) {
      const combos2 = await page.$$('button[role=combobox]');
      await combos2[0].click(); await sleep(1000);
      await page.click(searchSel); await page.type(searchSel, 'Bilal', { delay: 80 }); await sleep(3000);
    }
    await page.keyboard.press('ArrowDown'); await sleep(400);
    await page.keyboard.press('Enter'); await sleep(1200);
    console.log('After KEYBOARD, trigger:', await triggerText(page));
  }

  await page.screenshot({ path: 'output/markaz_manager_pick.png', fullPage: true });
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
