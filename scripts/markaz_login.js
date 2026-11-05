// Log in to Taleemabad Markaz, persist the session, and map the dashboard nav.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');

const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');

async function login() {
  const browser = await puppeteer.launch({
    headless: 'new',
    userDataDir: SESSION_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });

  const base = process.env.MARKAZ_URL || 'https://markaz.taleemabad.com/';
  console.log('Opening', base);
  await page.goto(base, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  // Already logged in? (session reused) — no email field present.
  const needsLogin = await page.$('input[type=email], input[name=email]');
  if (needsLogin) {
    console.log('Login form found — signing in...');
    await page.type('input[type=email], input[name=email]', process.env.MARKAZ_EMAIL, { delay: 30 });
    await page.type('input[type=password], input[name=password]', process.env.MARKAZ_PASSWORD, { delay: 30 });
    // Click the Sign in button
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(b => /sign in/i.test(b.innerText));
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 6000));
  } else {
    console.log('No login form — session already authenticated.');
  }

  console.log('URL after login:', page.url());

  // Capture any error/toast message (wrong password etc.)
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  const loggedIn = !/sign in to taleemabad|welcome back/i.test(bodyText);
  console.log('LOGIN_OK:', loggedIn);

  // Map clickable nav items (links + buttons with text) to find People Analyzer.
  const nav = await page.evaluate(() => {
    const items = [...document.querySelectorAll('a, button, [role=menuitem], nav *')]
      .map(el => ({ t: (el.innerText || '').trim().split('\n')[0], href: el.getAttribute('href') || '' }))
      .filter(x => x.t && x.t.length < 40);
    // de-dup
    const seen = new Set();
    return items.filter(x => { const k = x.t + x.href; if (seen.has(k)) return false; seen.add(k); return true; });
  });
  console.log('NAV_ITEMS:');
  nav.forEach(n => console.log('  -', JSON.stringify(n)));

  await page.screenshot({ path: 'output/markaz_dashboard.png', fullPage: true });
  console.log('Screenshot: output/markaz_dashboard.png');
  if (!loggedIn) console.log('PAGE_TEXT:\n', bodyText);

  await browser.close();
}

login().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
