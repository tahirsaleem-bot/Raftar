// Prints guide.html to a PDF with a running footer, the same way the exit interview
// records themselves are printed. Margins are set here, not in the CSS: a CSS @page margin
// overrides the print call's, and the footer lives in that bottom margin.
const path = require('path');
const fs = require('fs');
const pp = require('C:/Raftar/exit-interview-agent/node_modules/puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HERE = __dirname;
const OUT = path.join(HERE, 'Exit Interviews - How the process runs.pdf');

const footer = `
<table style="width:100%;border:0;border-collapse:collapse;
  font-family:Segoe UI,Arial,sans-serif;font-size:7pt;color:#6b7a8b;
  -webkit-print-color-adjust:exact"><tr>
  <td style="text-align:left;white-space:nowrap;padding:0 14mm">Exit Interviews &nbsp;&middot;&nbsp; People &amp; Culture, NIETE</td>
  <td style="text-align:center;white-space:nowrap;color:#8a2020;font-weight:600">Internal</td>
  <td style="text-align:right;white-space:nowrap;padding:0 14mm">Page <span class="pageNumber"></span> of <span class="totalPages"></span></td>
</tr></table>`;

(async () => {
  const browser = await pp.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.goto('file:///' + path.join(HERE, 'guide.html').replace(/\\/g, '/'),
    { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);

  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,            // without this the navy masthead prints white
    margin: { top: '12mm', right: '12mm', bottom: '14mm', left: '12mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: footer,
  });
  await browser.close();

  fs.writeFileSync(OUT, pdf);
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`${path.basename(OUT)} — ${(pdf.length / 1024).toFixed(0)} KB, ${pages} pages`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
