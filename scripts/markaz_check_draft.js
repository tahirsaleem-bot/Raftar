const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', userDataDir: SESSION_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,1400'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 1400 });
  await page.goto((process.env.MARKAZ_URL || 'https://markaz.taleemabad.com/') + 'people-analyzer',
    { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4500);
  const txt = await page.evaluate(() => document.body.innerText);
  // Focus on the "Assessments Submitted" / Self Assessment area
  const idx = txt.indexOf('Assessments Submitted');
  console.log('STATUS AROUND SUBMITTED SECTION:\n');
  console.log(txt.slice(idx >= 0 ? idx : 0, (idx >= 0 ? idx : 0) + 400));
  await page.screenshot({ path: 'output/markaz_draft_check.png', fullPage: true });
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
