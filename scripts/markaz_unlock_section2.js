// Fill Section 1, click "Submit Section 1" to UNLOCK Section 2, then dump Section 2 structure.
// Does NOT click final "Submit Assessment". For understanding the Section 2 fields only.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const BASE = process.env.MARKAZ_URL || 'https://markaz.taleemabad.com/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MANAGER_SEARCH = 'Zeshan';
const RATINGS = ['+ (Plus)','+ (Plus)','+ (Plus)','+ (Plus)','+ (Plus)','+/- (Plus/Minus)'];
const EV = "This is placeholder commentary used only to satisfy the minimum length requirement so that Section 1 can be submitted and Section 2 (People Competencies) becomes visible for review. It describes consistent, values-aligned behaviour with concrete situation, behaviour and impact framing across the cycle in a neutral and general manner.";

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
  const rect = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[role=option],li,div')]
      .filter(e => /zeshan/i.test((e.innerText || '').trim()) && (e.innerText || '').trim().length < 40)
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (rect) await page.mouse.click(rect.x, rect.y);
  await sleep(1000);
}

async function pickRating(page, rowIndex, label) {
  for (let a = 0; a < 2; a++) {
    const combos = await page.$$('button[role=combobox]');
    const combo = combos[rowIndex + 1];
    if (!combo) return null;
    await combo.click(); await sleep(700);
    for (let i=0;i<10;i++){ const n=await page.evaluate(()=>document.querySelectorAll('[role=option]').length); if(n>0)break; await sleep(300);}
    const picked = await page.evaluate((l) => {
      const opt = [...document.querySelectorAll('[role=option]')].find(o=>(o.innerText||'').trim()===l)
        || [...document.querySelectorAll('[role=option]')].find(o=>(o.innerText||'').trim().startsWith(l.split(' ')[0]));
      if (opt){opt.click();return (opt.innerText||'').trim();} return null;
    }, label);
    await sleep(600);
    if (picked) return picked;
    await page.keyboard.press('Escape'); await sleep(400);
  }
  return null;
}

async function setTA(page, idx, val){
  return page.evaluate((i,v)=>{const ta=[...document.querySelectorAll('textarea')][i];if(!ta)return false;
    const s=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;s.call(ta,v);
    ta.dispatchEvent(new Event('input',{bubbles:true}));ta.dispatchEvent(new Event('change',{bubbles:true}));return true;},idx,val);
}

(async () => {
  const browser = await puppeteer.launch({ headless:false, userDataDir:SESSION_DIR, defaultViewport:null,
    args:['--no-sandbox','--disable-setuid-sandbox','--start-maximized'] });
  const page = (await browser.pages())[0] || await browser.newPage();
  await page.goto(BASE + 'appraisals', { waitUntil:'networkidle2', timeout:60000 });
  await sleep(3000);
  await clickByText(page, /appraisal assessment/i); await sleep(2500);
  await clickByText(page, /upward/i); await sleep(3500);

  const combos = await page.evaluate(()=>document.querySelectorAll('button[role=combobox]').length);
  console.log('comboboxes:', combos);
  if (combos < 7){ console.log('form not ready'); await new Promise(()=>{}); }

  await selectManager(page);
  for (let i=0;i<6;i++){ const r=await pickRating(page,i,RATINGS[i]); await setTA(page,i,EV); console.log(`row ${i+1}: ${r}`);}
  await sleep(1000);

  // Click Submit Section 1 to unlock Section 2 (do NOT click anything else)
  const okS1 = await clickByText(page, /submit section 1/i);
  console.log('Submit Section 1 clicked:', okS1);
  await sleep(4500);

  // Scroll the scrollable modal container (and window) to load Section 2
  await page.evaluate(async()=>{
    const scrollers = [document.scrollingElement, ...document.querySelectorAll('*')].filter(e=>{
      try{ const s=getComputedStyle(e); return (s.overflowY==='auto'||s.overflowY==='scroll') && e.scrollHeight>e.clientHeight+50; }catch(_){return false;}
    });
    for (const sc of [document.scrollingElement, ...scrollers]) {
      for (let k=0;k<20;k++){ sc.scrollTop += 500; await new Promise(r=>setTimeout(r,120)); }
    }
  });
  await sleep(1500);
  const dump = await page.evaluate(()=>{
    const text=document.body.innerText.split('\n').map(s=>s.trim()).filter(Boolean);
    const s2i = text.findIndex(t=>/Section 2/i.test(t));
    return { locked: /People Competencies Locked/i.test(document.body.innerText),
      modalOpen: !!document.querySelector('[role=dialog]'),
      section2: s2i>=0? text.slice(s2i, s2i+150): text.slice(-80),
      combos:[...document.querySelectorAll('button[role=combobox]')].map(c=>(c.innerText||'').trim()),
      textareas:[...document.querySelectorAll('textarea')].length,
      inputs:[...document.querySelectorAll('input')].map(i=>({t:i.type,ph:i.placeholder})),
      sliders:[...document.querySelectorAll('[role=slider],input[type=range]')].length,
      radios:[...document.querySelectorAll('[role=radio],[role=radiogroup]')].length,
    };
  });
  console.log('modalOpen:', dump.modalOpen, 'radios:', dump.radios);
  console.log('LOCKED still?', dump.locked);
  console.log('combos now:', JSON.stringify(dump.combos));
  console.log('textareas:', dump.textareas, 'sliders:', dump.sliders, 'inputs:', JSON.stringify(dump.inputs));
  console.log('\n=== SECTION 2 TEXT ===');
  dump.section2.forEach(t=>console.log('  ',t));
  await page.screenshot({ path:'output/section2_unlocked.png', fullPage:true });
  console.log('\nDONE. Screenshot: output/section2_unlocked.png. Browser open (NOT final-submitted).');
  await new Promise(()=>{});
})().catch(e=>{console.error('ERROR:',e.message);process.exit(1);});
