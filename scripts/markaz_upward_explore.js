// Explore the Upward appraisal flow: open appraisal -> Appraisal Assessment (right)
// -> Upward -> select manager Zeshan Ali. Captures structure + screenshots at each
// step. Does NOT fill values, does NOT submit. Leaves browser open for review.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const BASE = process.env.MARKAZ_URL || 'https://markaz.taleemabad.com/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function dumpClickables(page, label) {
  const items = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a,button,[role=menuitem],[role=button],[role=tab]').forEach(e => {
      const t = (e.innerText || '').trim().split('\n')[0];
      if (t && t.length < 60) out.push(t);
    });
    return [...new Set(out)];
  });
  console.log(`\n[${label}] clickables (${items.length}):`);
  items.forEach(i => console.log('   -', i));
  return items;
}

async function clickByText(page, regex, tags = 'a,button,[role=menuitem],[role=button],[role=tab],div,span,li') {
  const rect = await page.evaluate((sel, src) => {
    const re = new RegExp(src, 'i');
    const cands = [...document.querySelectorAll(sel)]
      .filter(e => re.test((e.innerText || '').trim()))
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length); // smallest text = most specific
    const el = cands[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, txt: (el.innerText || '').trim().slice(0, 40) };
  }, tags, regex.source || regex);
  if (rect) { await page.mouse.click(rect.x, rect.y); }
  return rect;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false, userDataDir: SESSION_DIR, defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
  });
  const page = (await browser.pages())[0] || await browser.newPage();

  await page.goto(BASE + 'people-analyzer', { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(3500);
  console.log('Loaded:', page.url());
  await dumpClickables(page, 'landing');
  // Dump all visible text so we can see section names like "Appraisal", "Upward"
  const bodyText = await page.evaluate(() => document.body.innerText.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 120));
  console.log('\n[body text]:');
  bodyText.forEach(t => console.log('   ', t));
  await page.screenshot({ path: 'output/upward_1_landing.png', fullPage: true });

  // Open the "People and Culture" menu to reveal Appraisal section
  let r = await clickByText(page, /people and culture/i);
  console.log('click People and Culture ->', JSON.stringify(r));
  await sleep(2500);
  await dumpClickables(page, 'after People and Culture');
  await page.screenshot({ path: 'output/upward_2_menu.png', fullPage: true });

  // Go to Appraisals
  r = await clickByText(page, /^appraisals$/i);
  console.log('click Appraisals ->', JSON.stringify(r));
  await sleep(4000);
  console.log('URL:', page.url());
  await dumpClickables(page, 'Appraisals page');
  let bt = await page.evaluate(() => document.body.innerText.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,80));
  console.log('\n[Appraisals body]:'); bt.forEach(t=>console.log('   ',t));
  await page.screenshot({ path: 'output/upward_3_appraisals.png', fullPage: true });

  // Right side: Appraisal Assessment
  r = await clickByText(page, /appraisal assessment/i);
  console.log('\nclick Appraisal Assessment ->', JSON.stringify(r));
  await sleep(3000);
  await dumpClickables(page, 'after Appraisal Assessment');
  bt = await page.evaluate(() => document.body.innerText.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,80));
  console.log('\n[after Appraisal Assessment body]:'); bt.forEach(t=>console.log('   ',t));
  await page.screenshot({ path: 'output/upward_4_assessment.png', fullPage: true });

  // Select Upward
  r = await clickByText(page, /upward/i);
  console.log('\nclick Upward ->', JSON.stringify(r));
  await sleep(3000);

  // Capture ALL 6 core values (full text)
  const values = await page.evaluate(() =>
    [...document.querySelectorAll('td,div')].map(e => (e.innerText||'').trim())
      .filter(t => /:\s*\n?/.test(t) && t.length < 200 && /walk away|one for all|hold on|courageous|improve our craft|energy|positive|serve/i.test(t))
  );
  console.log('\n[core values found]:'); [...new Set(values)].forEach(v=>console.log('   >',v.replace(/\n/g,' | ')));

  // Open manager dropdown and search Zeshan
  const combos = await page.$$('button[role=combobox]');
  await combos[0].click();
  await sleep(1200);
  const searchSel = 'input[placeholder*="Search" i], input[type=text]';
  try {
    await page.waitForSelector(searchSel, { timeout: 5000 });
    await page.type(searchSel, 'Zeshan', { delay: 80 });
    await sleep(3000);
  } catch(e) { console.log('no search box', e.message); }
  const opts = await page.evaluate(() =>
    [...document.querySelectorAll('[role=option],li,[cmdk-item]')].map(o=>(o.innerText||'').trim()).filter(Boolean));
  console.log('\n[manager dropdown options for "Zeshan"]:'); [...new Set(opts)].forEach(o=>console.log('   *',o));
  await page.screenshot({ path: 'output/upward_5_manager.png', fullPage: true });
  await page.keyboard.press('Escape');

  // Dump form structure (comboboxes, options, textareas, labels)
  const form = await page.evaluate(() => {
    const combos = [...document.querySelectorAll('button[role=combobox]')].map(c => (c.innerText || '').trim());
    const textareas = [...document.querySelectorAll('textarea')].map(t => t.placeholder || '');
    const labels = [...document.querySelectorAll('label,h1,h2,h3,h4')].map(l => (l.innerText || '').trim()).filter(Boolean);
    return { comboCount: combos.length, combos, textareaCount: textareas.length, textareas, labels };
  });
  console.log('\n=== UPWARD FORM STRUCTURE ===');
  console.log(JSON.stringify(form, null, 2));

  console.log('\nBrowser OPEN for review. Screenshots in output/. Not filled, not submitted.');
  await new Promise(() => {});
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
