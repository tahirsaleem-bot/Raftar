// Open the Self Assessment form inside People Analyzer and dump its structure.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');

const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', userDataDir: SESSION_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,2000'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 2000 });
  await page.goto((process.env.MARKAZ_URL || 'https://markaz.taleemabad.com/') + 'people-analyzer',
    { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4000);

  // Click the purple "Self Assessment - People Analyzer" button.
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button, a, [role=button]')]
      .find(b => /self assessment/i.test((b.innerText || '')));
    if (btn) { btn.click(); return btn.innerText.trim(); }
    return null;
  });
  console.log('Clicked:', clicked);
  await sleep(4000);

  console.log('URL:', page.url());
  const text = await page.evaluate(() => document.body.innerText);
  console.log('FORM TEXT:\n' + text.slice(0, 4000));

  // Dump form controls: radios, selects, textareas, buttons.
  const fields = await page.evaluate(() => {
    const radios = [...document.querySelectorAll('input[type=radio]')].map(r => ({
      name: r.name, value: r.value, label: (r.closest('label')?.innerText || r.getAttribute('aria-label') || '').trim().slice(0, 30)
    }));
    const textareas = [...document.querySelectorAll('textarea')].map(t => ({
      name: t.name, placeholder: t.placeholder, id: t.id
    }));
    const selects = [...document.querySelectorAll('select')].map(s => ({
      name: s.name, options: [...s.options].map(o => o.text)
    }));
    const buttons = [...document.querySelectorAll('button, [role=button]')].map(b => (b.innerText || '').trim()).filter(Boolean);
    return { radios, textareas, selects, buttons: [...new Set(buttons)] };
  });
  console.log('\nFIELDS:', JSON.stringify(fields, null, 1));

  await page.screenshot({ path: 'output/markaz_pa_form.png', fullPage: true });
  console.log('\nScreenshot: output/markaz_pa_form.png');
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
