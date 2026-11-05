// Read-only: find a candidate by name in Markaz /api/applications and test /api/resume/:candidateId.
// Usage: node markaz_candidate_probe.js "<name>"
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const puppeteer = require('puppeteer');
const SESSION_DIR = path.join(__dirname, '..', '.markaz_session');
const OUT = path.join(__dirname, '..', 'output', 'markaz_cv_explore');

const scrub = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'password' ? undefined : typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '…' : v)));

(async () => {
  const name = process.argv[2];
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: SESSION_DIR, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('https://markaz.taleemabad.com/my-profile', { waitUntil: 'networkidle2', timeout: 60000 });
  const res = await page.evaluate(async () => { const r = await fetch('/api/applications', { credentials: 'include' }); return { s: r.status, t: await r.text() }; });
  let list = JSON.parse(res.t); if (!Array.isArray(list)) list = list.data || list.applications || [];
  console.log('applications status', res.s, 'count', list.length);
  const re = new RegExp(name.split(/\s+/).join('.*'), 'i');
  const hits = list.filter(a => re.test(`${a.candidate?.firstName || ''} ${a.candidate?.lastName || ''} ${a.candidate?.name || ''} ${a.name || ''}`));
  console.log('hits', hits.length);
  for (const h of hits.slice(0, 2)) {
    console.log(JSON.stringify(scrub(h), null, 1).slice(0, 3500));
    const cid = h.candidate?.id ?? h.candidateId;
    const r = await page.evaluate(async id => {
      const r = await fetch('/api/resume/' + id, { credentials: 'include' });
      const blob = await r.blob();
      const b64 = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(blob); });
      return { s: r.status, ct: r.headers.get('content-type'), n: blob.size, b64 };
    }, cid);
    console.log('resume', r.s, r.ct, r.n);
    if (r.s === 200 && r.n > 1000) { const f = path.join(OUT, `resume_${cid}.pdf`); fs.writeFileSync(f, Buffer.from(r.b64, 'base64')); console.log('saved', f); }
  }
  await browser.close();
})();
