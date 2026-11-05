// Read-only: open Markaz recruitment UI pages and record the real API calls they make.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const OUT = path.join(__dirname, '..', 'output', 'markaz_cv_explore');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: SESSION_DIR, args: ['--no-sandbox', '--window-size=1366,900'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  const calls = [];
  page.on('response', async res => {
    const t = res.request().resourceType(); if (t !== 'xhr' && t !== 'fetch') return;
    let body = ''; try { body = (await res.text()).slice(0, 700); } catch {}
    calls.push({ m: res.request().method(), u: res.url(), s: res.status(), body });
  });
  await page.goto('https://markaz.taleemabad.com/my-profile', { waitUntil: 'networkidle2', timeout: 60000 });

  // Collect SPA route strings from bundle that look like recruitment pages.
  const scripts = await page.evaluate(() => [...document.scripts].map(s => s.src).filter(Boolean));
  const routes = new Set();
  for (const s of scripts.filter(s => s.includes('markaz.taleemabad.com'))) {
    let txt = '';
    try { txt = await page.evaluate(async u => (await fetch(u)).text(), s); } catch { continue; }
    for (const m of txt.matchAll(/path:\s*["'`](\/[a-z0-9\-\/:]*)["'`]/gi)) routes.add(m[1]);
  }
  const rec = [...routes].filter(r => /recruit|candidate|job|hiring|applic|talent|pool/i.test(r));
  console.log('ROUTES:', [...routes].join(' '));
  console.log('RECRUIT ROUTES:', rec.join(' '));

  for (const r of rec.filter(r => !r.includes(':')).slice(0, 6)) {
    calls.length = 0;
    await page.goto('https://markaz.taleemabad.com' + r, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(x => setTimeout(x, 3000));
    const txt = await page.evaluate(() => document.body.innerText.slice(0, 500).replace(/\s+/g, ' '));
    console.log(`\n=== ${r}\n${txt}`);
    calls.filter(c => !/notifications|analytics|count/.test(c.u)).forEach(c => console.log('  ', c.s, c.m, c.u.slice(0, 120), '\n     ', c.body.slice(0, 300).replace(/\s+/g, ' ')));
    await page.screenshot({ path: path.join(OUT, 'rec' + r.replace(/\W+/g, '_') + '.png') });
  }
  await browser.close();
})();
