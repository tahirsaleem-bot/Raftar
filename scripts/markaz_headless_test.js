// Read-only: verify Markaz can be used with plain HTTP (no browser): login → applications → resume.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const BASE = 'https://markaz.taleemabad.com';

(async () => {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.MARKAZ_EMAIL, password: process.env.MARKAZ_PASSWORD }) });
  const cookies = (r.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  console.log('login', r.status, 'cookie names:', cookies.split('; ').map(c => c.split('=')[0]).join(','));
  const H = { Cookie: cookies };
  const a = await fetch(BASE + '/api/applications?offset=0', { headers: H });
  const list = await a.json();
  console.log('applications', a.status, Array.isArray(list) ? list.length : typeof list);
  let all = [], off = 0;
  for (;;) { const p = await (await fetch(`${BASE}/api/applications?offset=${off}`, { headers: H })).json(); all = all.concat(p); if (p.length < 500) break; off += 500; }
  console.log('total applications', all.length, 'keys:', Object.keys(all[0]).filter(k => /name|email|phone|candidate/i.test(k)).join(','));
  const hina = all.filter(x => /hina/i.test(JSON.stringify(x.candidate || x).slice(0, 400)) && /jafri|jaffri/i.test(JSON.stringify(x.candidate || x).slice(0, 400)));
  console.log('hina hits', hina.length, hina[0] && { id: hina[0].id, candidateId: hina[0].candidateId, status: hina[0].status });
  if (hina[0]) { const cv = await fetch(`${BASE}/api/resume/${hina[0].candidateId}`, { headers: H }); console.log('resume', cv.status, cv.headers.get('content-type'), (await cv.arrayBuffer()).byteLength); }
  console.log('candidate sample keys:', Object.keys(all[0].candidate || {}).join(','));
})();
