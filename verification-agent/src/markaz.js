// Read-only client for Markaz (markaz.taleemabad.com) over its own JSON API — the same calls the web app makes.
// Never writes to Markaz. Password hashes and other sensitive fields in API responses are dropped immediately.
const BASE = (process.env.MARKAZ_URL || 'https://markaz.taleemabad.com').replace(/\/$/, '');

let cookie = null;
const cache = { apps: null, appsAt: 0, profiles: null, profilesAt: 0 };

async function login() {
  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.MARKAZ_EMAIL, password: process.env.MARKAZ_PASSWORD }),
  });
  if (!r.ok) throw new Error('Markaz login failed (' + r.status + ')');
  cookie = (r.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
}

async function get(p, raw = false) {
  if (!cookie) await login();
  let r = await fetch(BASE + p, { headers: { Cookie: cookie } });
  if (r.status === 401 || r.status === 403) { await login(); r = await fetch(BASE + p, { headers: { Cookie: cookie } }); }
  if (!r.ok) throw new Error(`Markaz ${p.split('?')[0]} failed (${r.status})`);
  return raw ? r : r.json();
}

const norm = s => (s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
// Every word of q appears in the name (spaces ignored, so "Noor ul Ain" matches "Noor Ul-Ain").
const nameMatch = (q, full) => { const t = norm(full).join(''); const w = norm(q); return w.length > 0 && w.every(x => t.includes(x)); };

async function applications() {
  if (cache.apps && Date.now() - cache.appsAt < 30 * 60e3) return cache.apps;
  let all = [];
  for (let off = 0; off <= 50000; off += 500) {
    const page = await get(`/api/applications?offset=${off}`);
    all = all.concat(page);
    if (page.length < 500) break;
  }
  cache.apps = all.map(a => ({
    id: a.id, candidateId: a.candidateId, status: a.status, stage: a.stage, jobId: a.jobId,
    legalName: a.contractDraftingFullLegalName || null,
    first: a.candidate?.firstName || '', last: a.candidate?.lastName || '',
    email: a.candidate?.email || null, phone: a.candidate?.phone || null,
    position: a.candidate?.position || null, location: a.candidate?.location || null,
    hasResume: !!(a.candidate?.hasResumeData || a.candidate?.resumeFileName),
    updatedAt: a.updatedAt || a.candidate?.updatedAt || '',
  }));
  cache.appsAt = Date.now();
  return cache.apps;
}

async function profiles() {
  if (cache.profiles && Date.now() - cache.profilesAt < 6 * 3600e3) return cache.profiles;
  const users = await get('/api/users-with-profiles');
  cache.profiles = users.map(u => ({
    name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
    email: u.employeeProfile?.officialEmail || u.email,
    jobTitle: u.employeeProfile?.jobTitle || null,
    status: u.status,
  }));
  cache.profilesAt = Date.now();
  return cache.profiles;
}

const RANK = { hired: 0, offer: 1 };
async function search(q) {
  const apps = await applications();
  const prof = await profiles().catch(() => []);
  const hits = apps.filter(a => nameMatch(q, `${a.first} ${a.last}`) || (a.legalName && nameMatch(q, a.legalName)));
  hits.sort((a, b) => (RANK[a.status] ?? 5) - (RANK[b.status] ?? 5) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const seen = new Set();
  return hits.filter(h => !seen.has(h.candidateId) && seen.add(h.candidateId)).slice(0, 10).map(h => {
    const name = `${h.first} ${h.last}`.trim();
    const p = prof.find(p => p.status !== 'archived' && (nameMatch(name, p.name) || nameMatch(p.name, name)));
    return { ...h, name, officialEmail: p?.email || null, employeeTitle: p?.jobTitle || null };
  });
}

// Everyone currently marked "hired" in Talent Acquisition, with their official email when a profile exists.
async function hiredCandidates() {
  const apps = (await applications()).filter(a => a.status === 'hired');
  const prof = await profiles().catch(() => []);
  const seen = new Set();
  return apps.filter(h => !seen.has(h.candidateId) && seen.add(h.candidateId)).map(h => {
    const name = `${h.first} ${h.last}`.trim().replace(/\s+/g, ' ');
    const p = prof.find(p => p.status !== 'archived' && (nameMatch(name, p.name) || nameMatch(p.name, name)));
    return { ...h, name, officialEmail: p?.email || null };
  });
}

async function resume(candidateId) {
  const r = await get(`/api/resume/${candidateId}`, true);
  return { mime: (r.headers.get('content-type') || '').split(';')[0], buf: Buffer.from(await r.arrayBuffer()) };
}

module.exports = { search, resume, hiredCandidates, nameMatch };
