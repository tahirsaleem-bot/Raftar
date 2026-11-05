// Open People Analyzer and reveal the Self-Assessment section structure.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');

const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', userDataDir: SESSION_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.goto((process.env.MARKAZ_URL || 'https://markaz.taleemabad.com/') + 'people-analyzer',
    { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4000);

  console.log('URL:', page.url());
  const text = await page.evaluate(() => document.body.innerText);
  console.log('PAGE TEXT:\n' + text.slice(0, 2500));

  const ctrls = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a, button, [role=tab], [role=button]').forEach(e => {
      const t = (e.innerText || '').trim().split('\n')[0];
      if (t && t.length < 60) out.push(t);
    });
    return [...new Set(out)];
  });
  console.log('\nCONTROLS:', JSON.stringify(ctrls, null, 1));

  await page.screenshot({ path: 'output/markaz_people_analyzer.png', fullPage: true });
  console.log('\nScreenshot: output/markaz_people_analyzer.png');
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
