// Fill the People Analyzer Self-Assessment form (manager + 6 ratings + 6 evidence boxes).
// Does NOT submit. Leaves the visible browser open so Tahir can review and submit manually.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MANAGER_NAME = 'Muhammad Bilal Sadiq';
const MANAGER_SEARCH = 'Bilal';

const ROWS = [
  { rating: '+ (Plus)',
    evidence: "Even while on leave I never stepped back from urgent problems. While at my hometown for my brother's wedding, I remotely coordinated with the vendor to arrange an urgent car for Areej when her own vehicle was unavailable, and traveled about 45 minutes to the nearest city to resolve the coaches' blocked official SIMs. During a political protest with road closures, despite being on sick leave, I woke up early, checked the road situation, and stayed in contact with all drivers and coaches to keep pickups running." },
  { rating: '+ (Plus)',
    evidence: "I consistently step in so the team keeps moving. Whenever Safdar (support staff) was on leave or out of town, I personally handled kitchen stock purchases, event setups, refreshments and daycare checks. I also supported colleagues like Saima and Mariam by setting up the IT and screens for the FICO and NIETE All-Hands sessions so they could deliver smoothly, and arranged the cake and gift for Tanveer's farewell." },
  { rating: '+/- (Plus/Minus)',
    evidence: "I stay humble and consider no task beneath me - I personally buy snacks, get photocopies, and load event items without any ego about my role. At the same time, I sometimes hold on to control and prefer to handle important tasks myself (for example delivering documents and expensive equipment) rather than delegating to support staff. This is an area I am consciously working on - to trust the team more and share responsibilities." },
  { rating: '+ (Plus)',
    evidence: "I address issues directly with the person involved. When complaints came in about a driver's behavior, I spoke to both the driver and the vendor directly and made it clear that any repeat would lead to replacement and a payment hold. On the Jazz invoice, I raised the extra-charges issue with evidence over email and then visited their office in person to get the outstanding balance adjusted, and I negotiated a lower repair cost for Sara's damaged laptop." },
  { rating: '+ (Plus)',
    evidence: "I learn fast and keep improving how I solve problems. I resolved a printer fault by learning from the technician over a video call, fixed BitLocker issues on multiple laptops without reinstalling Windows, and when the AnyDesk free trial ended I evaluated the cost and proposed a one-time HDMI splitter solution instead of a recurring license. I also check warranties and coordinate with vendors (for example the studio TV backlight) to get cost-effective fixes." },
  { rating: '+ (Plus)',
    evidence: "I make a real effort to uplift the team. I arranged the cake and gift for Tanveer's farewell, organized a cake and bouquet for Nadeem Sahib, and prepared juice and omelets for the staff during an office breakfast. I try to keep the environment positive and celebrate colleagues, especially during busy or tough periods." },
];

async function selectManager(page) {
  const combos = await page.$$('button[role=combobox]');
  await combos[0].click();
  await sleep(1200);
  const searchSel = 'input[placeholder*="Search" i]';
  await page.waitForSelector(searchSel, { timeout: 6000 });
  await page.click(searchSel);
  await page.type(searchSel, MANAGER_SEARCH, { delay: 80 });
  await sleep(3000); // wait for API results
  // The real result is the element whose text is EXACTLY the manager name
  // (NOT "Submitted By: ..." which is the card behind the modal).
  const rect = await page.evaluate((name) => {
    const el = [...document.querySelectorAll('*')]
      .filter(e => (e.innerText || '').trim() === name)
      .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, MANAGER_NAME);
  let ok = false;
  if (rect) { await page.mouse.click(rect.x, rect.y); ok = true; }
  await sleep(1200);
  // verify the trigger now shows the manager name
  const triggerText = await page.evaluate(() => {
    const c = document.querySelector('button[role=combobox]');
    return c ? (c.innerText || '').trim() : '';
  });
  return { clicked: ok, triggerText };
}

async function pickRating(page, rowIndex, ratingLabel) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const combos = await page.$$('button[role=combobox]');
    const combo = combos[rowIndex + 1]; // +1 because index 0 is manager
    if (!combo) return null;
    await combo.focus();
    await combo.click();
    await sleep(700);
    for (let i = 0; i < 10; i++) {
      const n = await page.evaluate(() => document.querySelectorAll('[role=option]').length);
      if (n > 0) break;
      await sleep(300);
    }
    const picked = await page.evaluate((label) => {
      const opt = [...document.querySelectorAll('[role=option]')]
        .find(o => (o.innerText || '').trim() === label);
      if (opt) { opt.click(); return (opt.innerText || '').trim(); }
      return null;
    }, ratingLabel);
    await sleep(700);
    if (picked) return picked;
    await page.keyboard.press('Escape');
    await sleep(500);
  }
  return null;
}

async function setTextarea(page, index, text) {
  return page.evaluate((idx, val) => {
    const ta = [...document.querySelectorAll('textarea')][idx];
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, val);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, index, text);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: SESSION_DIR,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
  });
  const page = (await browser.pages())[0] || await browser.newPage();
  await page.goto((process.env.MARKAZ_URL || 'https://markaz.taleemabad.com/') + 'people-analyzer',
    { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button,a,[role=button]')].find(x => /self assessment/i.test(x.innerText||''));
    if (b) b.click();
  });
  await sleep(3500);

  // 1) Manager
  const mgr = await selectManager(page);
  console.log('Manager:', JSON.stringify(mgr));
  await sleep(800);

  // 2) Ratings + evidence
  for (let i = 0; i < ROWS.length; i++) {
    const picked = await pickRating(page, i, ROWS[i].rating);
    const taOk = await setTextarea(page, i, ROWS[i].evidence);
    console.log(`Row ${i + 1}: rating=${picked} | evidence=${taOk}`);
  }

  await sleep(1500);
  await page.screenshot({ path: 'output/markaz_filled.png', fullPage: true });
  console.log('\nFILLED (not submitted). Screenshot: output/markaz_filled.png');
  console.log('Browser is OPEN — review and click "Submit Assessment" manually.');

  await new Promise(() => {}); // keep browser open
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
