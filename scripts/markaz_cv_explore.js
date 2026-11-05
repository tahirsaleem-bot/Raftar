// Explore Markaz to find where employee/candidate CVs live, and which JSON APIs the pages call.
// Read-only: navigates and records network calls; never submits anything.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');

const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const OUT = path.join(__dirname, '..', 'output', 'markaz_cv_explore');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: SESSION_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,900'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });

  const api = [];
  page.on('response', async res => {
    const t = res.request().resourceType();
    if (t !== 'xhr' && t !== 'fetch') return;
    let body = '';
    try { body = (await res.text()).slice(0, 400); } catch {}
    api.push({ method: res.request().method(), url: res.url(), status: res.status(), body });
  });

  const base = process.env.MARKAZ_URL || 'https://markaz.taleemabad.com/';
  await page.goto(base, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  if (await page.$('input[type=email], input[name=email]')) {
    await page.type('input[type=email], input[name=email]', process.env.MARKAZ_EMAIL, { delay: 20 });
    await page.type('input[type=password], input[name=password]', process.env.MARKAZ_PASSWORD, { delay: 20 });
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /sign in/i.test(b.innerText)); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 6000));
  }
  console.log('URL:', page.url());

  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
    .map(a => ({ t: (a.innerText || '').trim().split('\n')[0], href: a.getAttribute('href') }))
    .filter(x => x.href && x.href.startsWith('/')));
  const uniq = [...new Map(links.map(l => [l.href, l])).values()];
  console.log('LINKS:'); uniq.forEach(l => console.log('  ', l.href, '|', l.t));

  // Visit likely pages for people / recruitment / documents.
  const candidates = uniq.filter(l => /people|employee|recruit|hiring|candidate|onboard|directory|team|profile|document|hr/i.test(l.href + ' ' + l.t));
  for (const l of candidates.slice(0, 12)) {
    try {
      await page.goto(new URL(l.href, base).href, { waitUntil: 'networkidle2', timeout: 45000 });
      await new Promise(r => setTimeout(r, 2500));
      const txt = await page.evaluate(() => document.body.innerText.slice(0, 600).replace(/\s+/g, ' '));
      console.log(`\n=== ${l.href} (${l.t})\n${txt}`);
      await page.screenshot({ path: path.join(OUT, l.href.replace(/[^a-z0-9]+/gi, '_') + '.png') });
    } catch (e) { console.log('ERR', l.href, e.message); }
  }

  fs.writeFileSync(path.join(OUT, 'api_calls.json'), JSON.stringify(api, null, 2));
  const apiUniq = [...new Map(api.map(a => [a.method + ' ' + a.url.split('?')[0], a])).values()];
  console.log('\nAPI CALLS:'); apiUniq.forEach(a => console.log('  ', a.status, a.method, a.url.split('?')[0]));
  await browser.close();
})();
