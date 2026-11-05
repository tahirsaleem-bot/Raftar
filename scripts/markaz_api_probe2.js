// Read-only: test /api/applications pagination/search params and find the login endpoint in the bundle.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: SESSION_DIR, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('https://markaz.taleemabad.com/my-profile', { waitUntil: 'networkidle2', timeout: 60000 });
  for (const q of ['?search=Hina', '?page=2', '?limit=5000', '?offset=500', '?page=2&limit=500', '?q=Hina']) {
    const r = await page.evaluate(async q => { const r = await fetch('/api/applications' + q, { credentials: 'include' }); const t = await r.text();
      let n = -1, first = ''; try { let j = JSON.parse(t); if (!Array.isArray(j)) j = j.data || j.applications || []; n = j.length; first = j[0]?.id; } catch {}
      return { s: r.status, n, first, keys: t.slice(0, 1) === '{' ? Object.keys(JSON.parse(t)).join(',') : 'array' }; }, q);
    console.log('applications' + q, JSON.stringify(r));
  }
  const scripts = await page.evaluate(() => [...document.scripts].map(s => s.src).filter(s => s.includes('markaz.taleemabad.com')));
  const hits = new Set();
  for (const s of scripts) {
    let t = ''; try { t = await page.evaluate(async u => (await fetch(u)).text(), s); } catch { continue; }
    for (const m of t.matchAll(/["'`](\/api\/[a-z0-9\-\/]*(?:login|signin|sign-in|session|auth)[a-z0-9\-\/]*)["'`]/gi)) hits.add(m[1]);
    for (const m of t.matchAll(/\/api\/applications[^"'`]{0,60}/g)) hits.add(m[0]);
  }
  console.log([...hits].join('\n'));
  await browser.close();
})();
