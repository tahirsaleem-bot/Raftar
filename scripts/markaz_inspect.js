// One-off: open Markaz, inspect the login page so we know the auth method.
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const url = process.env.MARKAZ_URL || 'https://markaz.taleemabad.com/';
  console.log('Opening', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000)); // let SPA render

  // Where did we land (likely redirected to a login page)?
  console.log('FINAL_URL:', page.url());
  console.log('TITLE:', await page.title());

  const info = await page.evaluate(() => {
    const text = document.body ? document.body.innerText.slice(0, 800) : '';
    const inputs = [...document.querySelectorAll('input')].map(i => ({
      type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
    }));
    const buttons = [...document.querySelectorAll('button, a[role=button], [type=submit]')]
      .map(b => (b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 25);
    const hasGoogle = /sign in with google|continue with google|google/i.test(text)
      || !!document.querySelector('[class*=google i],[id*=google i]');
    return { text, inputs, buttons, hasGoogle };
  });

  console.log('HAS_GOOGLE_HINT:', info.hasGoogle);
  console.log('INPUTS:', JSON.stringify(info.inputs, null, 1));
  console.log('BUTTONS:', JSON.stringify(info.buttons, null, 1));
  console.log('PAGE_TEXT:\n', info.text);

  await page.screenshot({ path: 'output/markaz_login.png', fullPage: true });
  console.log('Screenshot saved to output/markaz_login.png');

  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
