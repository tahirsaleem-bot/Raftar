// Read-only probe of Markaz JSON API using the saved session. Usage:
//   node markaz_api_probe.js endpoints [filterRegex]
//   node markaz_api_probe.js get <path>          (GET only; prints first 3000 chars)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');

(async () => {
  const [cmd, arg] = process.argv.slice(2);
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: SESSION_DIR, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('https://markaz.taleemabad.com/my-profile', { waitUntil: 'networkidle2', timeout: 60000 });
  const get = p => page.evaluate(async p => { const r = await fetch(p, { credentials: 'include' }); return r.status + '\n' + await r.text(); }, p);
  if (cmd === 'endpoints') {
    const map = JSON.parse((await get('/api/config/endpoints')).split('\n').slice(1).join('\n'));
    const re = new RegExp(arg || '.', 'i');
    Object.entries(map).filter(([k]) => re.test(k)).forEach(([k, v]) => console.log(k, '->', v));
  } else if (cmd === 'get') {
    console.log((await get(arg)).slice(0, 3000));
  }
  await browser.close();
})();
