// Read-only: download Markaz frontend JS bundles and list API paths + routes mentioning recruitment / CV / resume.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: SESSION_DIR, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const scripts = new Set();
  page.on('response', r => { if (r.request().resourceType() === 'script') scripts.add(r.url()); });
  await page.goto('https://markaz.taleemabad.com/my-profile', { waitUntil: 'networkidle2', timeout: 60000 });
  const found = new Set();
  for (const s of scripts) {
    if (!s.includes('markaz.taleemabad.com')) continue;
    const txt = await page.evaluate(async u => (await fetch(u)).text(), s);
    for (const m of txt.matchAll(/["'`](\/(?:api\/)?[a-z0-9\-\/:{}$._]*(?:recruit|candidate|applicant|resume|cv|hiring|onboard|job|document|upload|file)[a-z0-9\-\/:{}$._]*)["'`]/gi)) found.add(m[1]);
  }
  [...found].sort().forEach(f => console.log(f));
  await browser.close();
})();
