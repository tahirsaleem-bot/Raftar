// Fill the UPWARD Appraisal Assessment for manager Zeshan Ali.
// Section 1 (Values Scorecard): manager + 6 ratings + 6 evidence boxes (min 200 chars each).
// Does NOT submit. Leaves the visible browser open for manual review + submit.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const BASE = process.env.MARKAZ_URL || 'https://markaz.taleemabad.com/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MANAGER_SEARCH = 'Zeshan';
const MANAGER_NAME_RE = /zeshan/i;

const ROWS = [
  { rating: '+ (Plus)',
    evidence: "He consistently moves toward difficult problems instead of avoiding them. When something is complex, uncomfortable or high-pressure, he stays with it and sees it through rather than passing it on to someone else. He is willing to learn whatever is needed to get the job done, keeps his composure when things go wrong, and follows through on hard commitments. He takes ownership of tough situations and does not step back when the work gets challenging." },
  { rating: '+ (Plus)',
    evidence: "He genuinely thinks about the whole team and not just his own area. He steps in to support colleagues, shares what he learns openly, and looks out for people during uncertain or transitional times. He pushes for fair and consistent treatment so that no one feels left out or overlooked, and he is willing to repair working relationships rather than let friction linger. Overall he behaves like a real team player who wants everyone around him to do well." },
  { rating: '+ (Plus)',
    evidence: "He stays firmly grounded in his values, but he does not cling to his position, control or personal credit. He can set his ego aside, let things go, and move forward rather than holding on to grievances. He is able to hold different points of view at the same time without forcing his own, and he makes decisions based on principle rather than personal convenience. He listens sincerely, stays humble, and remains open-handed with ideas and credit." },
  { rating: '+/- (Plus/Minus)',
    evidence: "He has clearly improved at addressing issues directly - he no longer avoids hard conversations and tends to go straight to the person involved rather than letting problems build up. The area still developing is giving the same direct, courageous feedback upward to senior leadership, and openly inviting honest critique of himself and his own function. He is strong in these conversations with peers and his team; the next step is showing that same courage with those above him." },
  { rating: '+ (Plus)',
    evidence: "He actively seeks feedback and acts on it quickly. He takes learning seriously, reflects on it honestly, and applies it to the way he works. He recovers from mistakes without letting them hold him back and keeps sharpening his skills over time. The areas he is still growing into are longer-term capability building and stepping more into outward-facing leadership, but the underlying habit of learning and continuously improving is clearly present and consistent." },
  { rating: '+/- (Plus/Minus)',
    evidence: "Zeshan brings a warm, positive energy to the team and genuinely lifts the people around him. He keeps everyday interactions human, encourages less experienced team members, and makes an effort to keep the overall mood upbeat and supportive. The one area to work on is staying composed under heavy pressure - in very tense or high-stakes moments he can waver a little and let the stress show, which affects the calm energy the team looks to him for. When things are steady he is a real morale-builder; holding that same steadiness under pressure is the next step." },
];

async function clickByText(page, regex, tags = 'a,button,[role=menuitem],[role=button],[role=tab],div,span,li') {
  const rect = await page.evaluate((sel, src) => {
    const re = new RegExp(src, 'i');
    const cands = [...document.querySelectorAll(sel)]
      .filter(e => re.test((e.innerText || '').trim()))
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
    const el = cands[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, tags, regex.source || regex);
  if (rect) { await page.mouse.click(rect.x, rect.y); }
  return !!rect;
}

async function selectManager(page) {
  const combos = await page.$$('button[role=combobox]');
  await combos[0].click();
  await sleep(1200);
  const searchSel = 'input[placeholder*="Search" i], input[type=text]';
  await page.waitForSelector(searchSel, { timeout: 6000 });
  await page.type(searchSel, MANAGER_SEARCH, { delay: 80 });
  await sleep(3000);
  const rect = await page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const el = [...document.querySelectorAll('[role=option],li,[cmdk-item],div')]
      .filter(e => re.test((e.innerText || '').trim()) && (e.innerText || '').trim().length < 40)
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, txt: (el.innerText || '').trim() };
  }, MANAGER_NAME_RE.source);
  if (rect) { await page.mouse.click(rect.x, rect.y); }
  await sleep(1200);
  const triggerText = await page.evaluate(() =>
    (document.querySelector('button[role=combobox]')?.innerText || '').trim());
  return { picked: rect?.txt || null, triggerText };
}

async function pickRating(page, rowIndex, ratingLabel) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const combos = await page.$$('button[role=combobox]');
    const combo = combos[rowIndex + 1]; // +1: index 0 is manager
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
        .find(o => (o.innerText || '').trim() === label)
        || [...document.querySelectorAll('[role=option]')]
          .find(o => (o.innerText || '').trim().startsWith(label.split(' ')[0]));
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
    headless: false, userDataDir: SESSION_DIR, defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
  });
  const page = (await browser.pages())[0] || await browser.newPage();

  // Navigate to the Appraisals page. Try direct routes, else the P&C menu.
  const hasAssessmentBtn = async () => page.evaluate(() =>
    [...document.querySelectorAll('a,button,[role=button],div,span')]
      .some(e => /appraisal assessment/i.test((e.innerText || '').trim()) && (e.innerText||'').trim().length < 40));

  let onAppraisals = false;
  for (const route of ['appraisals', 'appraisal-assessment', 'people-analyzer']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(3000);
    if (await hasAssessmentBtn()) { onAppraisals = true; console.log('Appraisals via route:', page.url()); break; }
    console.log('route', route, '-> no assessment btn, url=', page.url());
  }
  if (!onAppraisals) {
    // Fall back to the People and Culture nav menu
    await page.goto(BASE + 'people-analyzer', { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(3000);
    await clickByText(page, /people and culture/i);
    await sleep(2500);
    const okA = await clickByText(page, /^appraisals$/i);
    console.log('menu Appraisals click:', okA);
    await sleep(4000);
    onAppraisals = await hasAssessmentBtn();
  }
  console.log('On appraisals page?', onAppraisals, 'url=', page.url());

  // Right side: Appraisal Assessment -> Upward
  const okAA = await clickByText(page, /appraisal assessment/i);
  console.log('Appraisal Assessment click:', okAA);
  await sleep(2500);
  const okUp = await clickByText(page, /upward/i);
  console.log('Upward click:', okUp);
  await sleep(3500);

  const combosNow = await page.evaluate(() => document.querySelectorAll('button[role=combobox]').length);
  const tasNow = await page.evaluate(() => document.querySelectorAll('textarea').length);
  console.log(`Form ready? comboboxes=${combosNow} textareas=${tasNow}`);
  if (combosNow < 7) { console.log('!! Form not detected as expected. Leaving browser open for manual check.'); await new Promise(()=>{}); }

  // 1) Manager
  const mgr = await selectManager(page);
  console.log('Manager:', JSON.stringify(mgr));
  await sleep(800);

  // 2) Ratings + evidence
  for (let i = 0; i < ROWS.length; i++) {
    const picked = await pickRating(page, i, ROWS[i].rating);
    const taOk = await setTextarea(page, i, ROWS[i].evidence);
    console.log(`Row ${i + 1}: rating=${picked} | evidence=${taOk} (${ROWS[i].evidence.length} chars)`);
    await sleep(300);
  }

  await sleep(1500);
  await page.screenshot({ path: 'output/upward_filled.png', fullPage: true });
  console.log('\nFILLED Section 1 (not submitted). Screenshot: output/upward_filled.png');
  console.log('Browser is OPEN - review, then handle Section 2 / submit.');
  await new Promise(() => {});
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
