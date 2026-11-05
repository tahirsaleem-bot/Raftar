// Read-only: Talent Acquisition → Candidates tab → search a name; print API calls and visible result text.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');

(async () => {
  const name = process.argv[2] || 'Zia';
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: SESSION_DIR, args: ['--no-sandbox', '--window-size=1366,900'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  const calls = [];
  page.on('response', async res => {
    const t = res.request().resourceType(); if (t !== 'xhr' && t !== 'fetch') return;
    let body = ''; try { body = (await res.text()).slice(0, 900); } catch {}
    calls.push({ m: res.request().method(), u: res.url(), s: res.status(), body });
  });
  await page.goto('https://markaz.taleemabad.com/talent-acquisition', { waitUntil: 'networkidle2', timeout: 60000 });
  const tab = await page.evaluateHandle(() => [...document.querySelectorAll('button,[role=tab]')].find(b => b.innerText.trim() === 'Candidates'));
  if (tab.asElement()) await tab.asElement().click(); // real mouse click (Radix tabs ignore el.click())
  await new Promise(r => setTimeout(r, 4000));
  calls.length = 0;
  const box = await page.$('input[placeholder*="earch" i]');
  if (box) { await box.type(name, { delay: 40 }); await new Promise(r => setTimeout(r, 5000)); }
  console.log('search box found:', !!box);
  const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1500));
  console.log('PAGE:', txt);
  calls.filter(c => !/notifications|analytics|count|assets/.test(c.u)).forEach(c =>
    console.log('\n', c.s, c.m, c.u.slice(0, 160), '\n   ', c.body.replace(/"password":"[^"]*"/g, '"password":"<hidden>"').slice(0, 900)));
  await page.screenshot({ path: path.join(__dirname, '..', 'output', 'markaz_cv_explore', 'ta_search.png') });
  await browser.close();
})();
