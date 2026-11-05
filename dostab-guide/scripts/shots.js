// Seeds a throwaway Dostab with demo friends, then walks the real UI on a phone-sized
// viewport, saving one screenshot per step plus the measured box of the control to tap.
// Run: node scripts/shots.js
const fs = require('fs'), os = require('os'), path = require('path');
const puppeteer = require('C:/Raftar/ai-agent-starter/node_modules/puppeteer');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dostab-demo-'));
const { app } = require('C:/Raftar/hisaab/server.js');
const OUT = path.join(__dirname, '..', 'public', 'shots');
const VW = 390, VH = 844;

const server = app.listen(3100);
const BASE = 'http://localhost:3100';
function client() {
  let cookie = '';
  const call = async (p, body, method) => {
    const r = await fetch(BASE + '/api' + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const j = await r.json(); if (!r.ok) throw new Error(`${p}: ${j.error}`); return j;
  };
  call.cookie = () => cookie;
  return call;
}

async function seed() {
  const people = ['Tahir Saleem', 'Zeshan Ali', 'Ali Raza', 'Bilal Khan', 'Hamza Tariq', 'Usman Malik'];
  const c = {}, id = {};
  for (const [i, n] of people.entries()) {
    const k = n.split(' ')[0].toLowerCase();
    c[k] = client();
    await c[k]('/signup', { name: n, email: `${k}@gmail.com`, password: 'demo1234', phone: `0300123456${i}` });
    id[k] = (await c[k]('/me')).user.id;
  }
  const group = async (owner, name, members) => {
    const { id: gid } = await c[owner]('/groups', { name });
    for (const m of members) await c[owner](`/groups/${gid}/members`, { email: `${m}@gmail.com` });
    return gid;
  };
  const exp = (who, gid, description, amount, paid_by, date, people, exact) =>
    c[who](`/groups/${gid}/expenses`, exact
      ? { description, amount, paid_by: id[paid_by], date, split_type: 'exact', exact: Object.fromEntries(Object.entries(exact).map(([k, v]) => [id[k], v])) }
      : { description, amount, paid_by: id[paid_by], date, split_type: 'equal', participants: people.map((p) => id[p]) });

  const lunch = await group('tahir', 'Office Lunches', ['zeshan', 'usman']);
  await exp('tahir', lunch, 'Biryani', '1800', 'tahir', '2026-10-02', null, { tahir: '600', zeshan: '700', usman: '500' });
  const hunza = await group('zeshan', 'Hunza Tour', ['tahir', 'hamza']);
  await exp('zeshan', hunza, 'Jeep hire', '15000', 'zeshan', '2026-10-10', ['tahir', 'zeshan', 'hamza']);
  await exp('tahir', hunza, 'Food', '4500', 'tahir', '2026-10-11', ['tahir', 'zeshan', 'hamza']);
  const murree = await group('tahir', 'Murree Trip', ['zeshan', 'ali', 'bilal']);
  const four = ['tahir', 'zeshan', 'ali', 'bilal'];
  await exp('zeshan', murree, 'Hotel (2 nights)', '24000', 'zeshan', '2026-10-18', four);
  await exp('tahir', murree, 'Petrol', '8000', 'tahir', '2026-10-18', four);
  await exp('ali', murree, 'Dinner at Mall Road', '6400', 'ali', '2026-10-19', four);
  return { c, id };
}

(async () => {
  const { c, id } = await seed();
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--no-sandbox', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  const meta = {};
  const settle = async (ms = 650) => { await page.evaluate(() => document.fonts.ready); await new Promise((r) => setTimeout(r, ms)); };

  // Find the element by CSS selector, or by its visible text inside `scope`.
  async function find(sel, text) {
    const handles = await page.$$(sel);
    for (const h of handles) {
      const ok = await h.evaluate((el, t) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (!t || el.textContent.replace(/\s+/g, ' ').includes(t));
      }, text || '');
      if (ok) return h;
    }
    throw new Error(`not found: ${sel} ${text || ''}`);
  }
  async function shot(name, sel, text) {
    let ring = null, h = null;
    if (sel) {
      h = await find(sel, text);
      await h.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await settle(300);
      const r = await h.evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
      ring = { x: (r.x + r.w / 2) / VW, y: (r.y + r.h / 2) / VH, w: r.w / VW, h: r.h / VH };
    } else await settle();
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    meta[name] = { file: `${name}.png`, width: VW * 3, height: VH * 3, ring };
    console.log('shot', name, ring ? `${(ring.x * VW) | 0},${(ring.y * VH) | 0}` : '');
    return h;
  }
  const tap = async (h, ms = 700) => { await h.click(); await settle(ms); };
  const type = async (sel, v) => { const el = await page.$(sel); await el.click({ clickCount: 3 }); await el.type(v); };

  // 1. Sign up (filled in, not submitted — Tahir already exists from the seed)
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await settle();
  await tap(await find('[data-mode="signup"]'));
  await type('input[name=name]', 'Tahir Saleem');
  await type('input[name=email]', 'tahir@gmail.com');
  await type('input[name=password]', 'demo1234');
  await type('input[name=phone]', '03001234560');
  await page.$eval('input[name=phone]', (el) => el.blur());
  await shot('signup', 'button[type=submit]', 'Create account');

  // Log in as the seeded Tahir from here on.
  await page.setCookie({ name: 'sid', value: c.tahir.cookie().split('=')[1], domain: 'localhost', path: '/' });
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await settle(900);
  await shot('home', '#newGroup');

  // 2. New group
  await tap(await find('#newGroup'));
  await type('#ngForm input[name=name]', 'Soup Night');
  await shot('newgroup', '#ngForm button[type=submit]');
  await tap(await find('#ngForm button[type=submit]'), 1200);
  const gid = Number(page.url().match(/#\/g\/(\d+)/)[1]);
  await shot('group_new', '#membersBtn');

  // 3. Add a friend by email
  await tap(await find('#membersBtn'));
  await type('#addMem input[name=email]', 'zeshan@gmail.com');
  await shot('members', '#addMem button[type=submit]');
  await tap(await find('#addMem button[type=submit]'), 1200);
  for (const m of ['ali', 'bilal', 'hamza', 'usman']) await c.tahir(`/groups/${gid}/members`, { email: `${m}@gmail.com` });
  await shot('invite', 'a.btn', 'WhatsApp');
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle0' });
  await page.goto(BASE + `/#/g/${gid}`, { waitUntil: 'networkidle0' });
  await settle(900);
  await shot('group_full', '#addExp');

  // 4. Add expense — soup for 6, split equally
  await tap(await find('#addExp'));
  await type('#expForm input[name=description]', 'Soup');
  await type('#expForm input[name=amount]', '1200');
  await page.$eval('#expForm input[name=amount]', (el) => el.blur());
  await shot('expense_top', '#expForm input[name=amount]');
  await shot('expense_split', '#splitStatus');
  await tap(await find('[data-split="exact"]'));
  await shot('expense_exact', '[data-split="exact"]');
  await tap(await find('[data-split="equal"]'));
  const submit = await shot('expense_submit', '#expForm button[type=submit]');
  await tap(submit, 1300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('group_expense', '[data-tab="balances"]');

  // 5. Balances + reminder
  await tap(await find('[data-tab="balances"]'));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('balances', '[data-remind]');
  await tap(await find('[data-remind]'), 1200);
  await shot('reminder', 'a.btn-primary', 'WhatsApp');
  await page.keyboard.press('Escape');
  await settle();

  // 6. History
  await tap(await find('[data-tab="activity"]'));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('history', '[data-tab="activity"]');

  // 7. Friends — totals across every trip
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await shot('home_full', '[data-home="friends"]');
  await tap(await find('[data-home="friends"]'));
  await shot('friends', `[data-friend="${id.zeshan}"]`);
  await tap(await find(`[data-friend="${id.zeshan}"]`), 1000);
  await shot('friend', '#fRemind, #fSettle');
  await shot('friend_settle', '#fSettle');

  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(meta, null, 2));
  await browser.close();
  server.close();
  console.log('done', Object.keys(meta).length, 'shots');
})().catch((e) => { console.error(e); process.exit(1); });
