// The verification pipeline. processCase() is idempotent: it looks at a case, does whatever step is due, and returns.
// No first email is ever sent from here — contact requests and verification emails go out only via sendContact()/sendOrg(),
// which the app calls when Raftar taps Send. Only follow-up reminders are sent automatically.
// The thinking steps (read CV, read the employee's reply, web-check an organization, read an org's reply) run either here
// via the Claude API (when ANTHROPIC_API_KEY is set) or in the hourly Claude Code routine, which takes them from
// /agent/tasks and posts results to /agent/result. Both paths use the same apply*() functions.
const fs = require('fs');
const cfg = require('./config');
const store = require('./store');
const gmail = require('./gmail');
const markaz = require('./markaz');
const ai = require('./ai');
const T = require('./templates');

const INTERNAL = /@(taleemabad\.com|niete\.edu\.pk)\b/i;
const days = iso => (Date.now() - new Date(iso).getTime()) / 86400e3;
const slug = s => (s || '').toLowerCase().replace(/\b(the|pvt|private|ltd|limited|llc|school|system|international|campus)\b/g, '').replace(/[^a-z0-9]+/g, '');
const emailOf = s => ((s || '').match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [])[0]?.toLowerCase() || null;

function businessHoursPKT() {
  const d = new Date(Date.now() + cfg.PKT_OFFSET_MIN * 60e3);
  const day = d.getUTCDay(), h = d.getUTCHours();
  return day >= 1 && day <= 5 && h >= 10 && h < 17;
}

// ---------- create ----------
function createCase(sel, { auto = false } = {}) {
  const st = store.get();
  const name = sel.name.trim().replace(/\s+/g, ' ');
  const c = {
    id: String(st.seq++), name, firstName: name.split(' ')[0], createdAt: new Date().toISOString(), archived: false, autoCreated: auto,
    markaz: sel.candidateId ? { candidateId: sel.candidateId, applicationId: sel.id, status: sel.status, position: sel.position, personalEmail: sel.email, phone: sel.phone } : null,
    employeeEmail: sel.officialEmail || null,
    cv: null, contact: { status: 'none', seenIds: [], analysedIds: [] }, orgs: [], log: [],
  };
  st.cases.unshift(c);
  store.log(c, auto ? 'Case created automatically — new hire in Markaz' : `Case created from ${c.markaz ? 'Markaz' : 'manual entry'}`);
  store.save();
  return c;
}

// ---------- CV ----------
async function ensureCvFile(c) {
  const p = store.cvPath(c.id);
  if (fs.existsSync(p)) return true;
  if (!c.markaz?.candidateId || !process.env.MARKAZ_EMAIL) return false;
  const r = await markaz.resume(c.markaz.candidateId);
  fs.writeFileSync(p, r.buf);
  fs.writeFileSync(p + '.json', JSON.stringify({ mime: r.mime }));
  store.log(c, `CV downloaded from Markaz (${Math.round(r.buf.length / 1024)} KB)`);
  return true;
}
const cvFile = c => { const p = store.cvPath(c.id); return fs.existsSync(p) ? { ...JSON.parse(fs.readFileSync(p + '.json', 'utf8')), path: p } : null; };

function applyCv(c, data) {
  c.cv = { ...data, extractedAt: new Date().toISOString() };
  store.log(c, `CV read: ${c.cv.experience.length} experience entries`);
}

async function ensureCv(c) {
  if (c.cv) return;
  if (!(await ensureCvFile(c))) return;
  if (!ai.ready()) return;                                   // the hourly routine reads it
  const f = cvFile(c);
  applyCv(c, await ai.extractCv(f.mime, fs.readFileSync(f.path)));
}

function saveUploadedCv(c, mime, b64) {
  const p = store.cvPath(c.id);
  fs.writeFileSync(p, Buffer.from(b64, 'base64'));
  fs.writeFileSync(p + '.json', JSON.stringify({ mime }));
  c.cv = null;
  store.log(c, 'CV uploaded from the app');
}

// ---------- contact request to the employee ----------
async function ensureContactDraft(c) {
  if (c.contact.status !== 'none') return;
  // An earlier request may already exist in Gmail (sent before this app existed).
  const hits = await gmail.search(`in:sent subject:("Contact Details Required") "${c.firstName}"`, 5);
  for (const h of hits) {
    const m = await gmail.getMessage(h.id);
    const hd = gmail.headers(m);
    if (c.employeeEmail && !(hd.to || '').toLowerCase().includes(c.employeeEmail.toLowerCase())) continue;
    Object.assign(c.contact, { status: 'sent', threadId: m.threadId, msgId: m.id, msgIdHeader: hd['message-id'], sentAt: new Date(Number(m.internalDate)).toISOString(), found: true });
    if (!c.employeeEmail) c.employeeEmail = emailOf(hd.to);
    store.log(c, 'Found the earlier contact-details request in Gmail — tracking that thread');
    return;
  }
  const t = T.contactRequest({ firstName: c.firstName, fullName: c.name });
  Object.assign(c.contact, { status: 'draft', subject: t.subject, html: t.html });
}

async function sendContact(c, to) {
  if (c.contact.status !== 'draft') throw new Error('Contact request is not in draft');
  const addr = emailOf(to || c.employeeEmail);
  if (!addr) throw new Error('No employee email — add it first');
  c.employeeEmail = addr;
  const r = await gmail.send({ to: `${c.name} <${addr}>`, cc: cfg.CC, subject: c.contact.subject, html: c.contact.html });
  Object.assign(c.contact, { status: 'sent', threadId: r.threadId, msgId: r.id, msgIdHeader: r.messageIdHeader, sentAt: new Date().toISOString() });
  store.log(c, `Contact-details request sent to ${addr}`);
}

async function readContactThread(c) {
  if (!['sent', 'replied'].includes(c.contact.status)) return [];
  const th = await gmail.getThread(c.contact.threadId);
  const sentAt = new Date(c.contact.sentAt).getTime();
  const replies = th.messages.filter(m => Number(m.internalDate) >= sentAt - 60e3 && !gmail.isMe(gmail.headers(m).from) && !gmail.isBounce(gmail.headers(m).from));
  if (replies.length) c.contact.status = 'replied';
  else if (days(c.contact.sentAt) >= cfg.CONTACT_REMINDER_DAYS && !c.contact.reminderAt && businessHoursPKT()) {
    const last = th.messages[th.messages.length - 1];
    await gmail.send({ to: `${c.name} <${c.employeeEmail}>`, cc: cfg.CC, subject: 'Re: ' + (gmail.headers(last).subject || c.contact.subject).replace(/^re:\s*/i, ''),
      html: T.contactReminder({ firstName: c.firstName }), threadId: c.contact.threadId, inReplyTo: gmail.headers(last)['message-id'] });
    c.contact.reminderAt = new Date().toISOString();
    store.log(c, 'Reminder sent to the employee for contact details');
  }
  return replies;
}

// ---------- the employee's reply → organizations ----------
async function analyseContacts(c, replies) {
  const ids = replies.map(m => m.id);
  if (!ids.length || ids.every(id => c.contact.analysedIds.includes(id))) { c.pendingReplies = null; return; }
  if (!c.cv) return;
  const packed = [];
  for (const m of replies) {
    const atts = await gmail.attachments(m, ai.ready() ? 6 : 0);   // the routine downloads attachments itself
    packed.push({ msgId: m.id, date: gmail.headers(m).date, text: gmail.stripQuoted(gmail.textOf(m)).slice(0, 8000), attachments: atts });
  }
  if (!ai.ready()) { c.pendingReplies = { ids, replies: packed.map(r => ({ ...r, attachments: r.attachments.map(({ data, ...a }) => a) })) }; return; }
  applyContacts(c, await ai.parseContacts(c.cv, packed), ids);
}

function applyContacts(c, res, ids) {
  c.contactsSummary = res.summary;
  c.cvWithoutContact = res.cv_entries_without_contact;
  for (const o of res.organizations) {
    const cvE = o.cv_index != null ? c.cv.experience[o.cv_index] : null;
    const key = slug(o.organization) || slug(cvE?.organization) || 'org' + Math.random().toString(36).slice(2, 6);
    let row = c.orgs.find(x => x.key === key || (x.key.length > 3 && key.length > 3 && (x.key.includes(key) || key.includes(x.key))));
    if (row && !['draft', 'checking', 'error'].includes(row.status)) { row.notes = o.notes; row.documents = o.documents; continue; } // already sent: keep
    row ||= { key, seenIds: [] };
    Object.assign(row, {
      organization: cvE?.organization || o.organization, designation: cvE?.designation || o.designation_per_employee,
      start: cvE?.start || o.start_per_employee, end: cvE?.end || o.end_per_employee, location: cvE?.location || null,
      designation_cv: cvE?.designation || null, designation_per_employee: o.designation_per_employee,
      start_per_employee: o.start_per_employee, end_per_employee: o.end_per_employee,
      contact_name: o.contact_name, contact_title: o.contact_title, contact_email: o.contact_email, contact_phone: o.contact_phone,
      documents: o.documents, notes: o.notes, status: 'checking', check: null, error: null,
    });
    if (!c.orgs.includes(row)) c.orgs.push(row);
  }
  c.contact.analysedIds = ids;
  c.pendingReplies = null;
  store.log(c, `Employee reply analysed: ${res.organizations.length} organizations`);
}

// ---------- web check → draft (sending is always Raftar's tap) ----------
async function checkAndDraft(c, row) {
  if (!ai.ready()) return;                                   // the hourly routine checks it
  try { applyCheck(c, row, await ai.checkOrganization(row, c.cv)); }
  catch (e) { row.status = 'error'; row.error = e.message; store.log(c, `${row.organization}: check failed — ${e.message}`); }
}

function applyCheck(c, row, check) {
  row.check = check;
  const to = emailOf(check.recommended_to_email) || emailOf(row.contact_email);
  row.to = to;
  row.toName = check.recommended_to_name || (to && to === emailOf(row.contact_email) ? row.contact_name : null);
  row.contactFromCandidate = !!to && to === emailOf(row.contact_email);
  renderOrgDraft(c, row);
  row.status = 'draft';
  store.log(c, `${row.organization}: web check done (risk ${check.risk}, ${check.red_flags.length} red flags) — draft ready`);
}

function renderOrgDraft(c, row) {
  const t = T.verification({ recipientName: row.toName, candidate: c.name, org: row.organization, designation: row.designation,
    start: row.start, end: row.end, contactFromCandidate: row.contactFromCandidate });
  row.subject = t.subject; row.html = t.html;
}

async function sendOrg(c, key, { to, toName } = {}) {
  const row = c.orgs.find(r => r.key === key);
  if (!row) throw new Error('Organization not found');
  if (!['draft', 'error'].includes(row.status)) throw new Error('Already sent');
  const addr = emailOf(to || row.to);
  if (!addr) throw new Error('No recipient email for ' + row.organization);
  if (toName !== undefined) row.toName = toName || null;
  if (to) row.contactFromCandidate = addr === emailOf(row.contact_email);
  row.to = addr;
  renderOrgDraft(c, row);
  const r = await gmail.send({ to: row.toName ? `${row.toName} <${addr}>` : addr, cc: cfg.CC, subject: row.subject, html: row.html });
  Object.assign(row, { status: 'sent', threadId: r.threadId, msgId: r.id, msgIdHeader: r.messageIdHeader, sentAt: new Date().toISOString(), error: null });
  store.log(c, `Verification email sent to ${row.organization} (${addr})`);
}

// ---------- replies from organizations, reminders ----------
function applyReply(c, row, v) {
  Object.assign(row.reply, v);
  row.status = v.verdict === 'auto_reply_or_unrelated' ? (row.reminderAt ? 'reminded' : 'sent') : v.verdict;
  store.log(c, `${row.organization}: reply read — ${v.verdict}`);
}

async function followOrg(c, row) {
  if (!row.threadId && row.msgId) { const m = await gmail.getMessage(row.msgId); row.threadId = m.threadId; row.msgIdHeader = gmail.headers(m)['message-id']; }
  if (!['sent', 'reminded'].includes(row.status) && !(row.status === 'replied' && !row.reply?.verdict)) return;
  const th = await gmail.getThread(row.threadId);
  const sentAt = new Date(row.sentAt).getTime();
  const after = th.messages.filter(m => Number(m.internalDate) > sentAt + 1000);
  const bounce = after.find(m => gmail.isBounce(gmail.headers(m).from));
  const replies = after.filter(m => { const f = gmail.headers(m).from || ''; return !gmail.isMe(f) && !gmail.isBounce(f) && (!INTERNAL.test(f) || (row.to && f.toLowerCase().includes(row.to))); });
  if (replies.length) {
    const last = replies[replies.length - 1];
    if (row.seenIds.includes(last.id) && row.reply?.verdict) return;
    if (!row.seenIds.includes(last.id)) {
      row.reply = { text: gmail.stripQuoted(gmail.textOf(last)).slice(0, 6000), from: gmail.headers(last).from, at: new Date(Number(last.internalDate)).toISOString() };
      row.seenIds.push(last.id);
      row.status = 'replied';
      store.log(c, `${row.organization}: reply received`);
    }
    if (ai.ready()) applyReply(c, row, await ai.classifyReply(row, c.name, row.reply.text));
    return;
  }
  if (bounce) { row.status = 'bounced'; store.log(c, `${row.organization}: email bounced`); return; }
  if (row.status === 'sent' && days(row.sentAt) >= cfg.REMINDER_DAYS && businessHoursPKT()) {
    const last = th.messages[th.messages.length - 1];
    await gmail.send({ to: row.toName ? `${row.toName} <${row.to}>` : row.to, cc: cfg.CC,
      subject: 'Re: ' + (gmail.headers(last).subject || row.subject || '').replace(/^re:\s*/i, ''),
      html: T.orgReminder({ recipientName: row.toName, candidate: c.name, sentAt: row.sentAt }),
      threadId: row.threadId, inReplyTo: gmail.headers(last)['message-id'] });
    row.status = 'reminded'; row.reminderAt = new Date().toISOString();
    store.log(c, `${row.organization}: reminder sent`);
  }
}

// ---------- one pass over a case ----------
async function processCase(c) {
  if (c.archived || c.busy) return;
  c.busy = true;
  try {
    c.error = null;
    if (!c.markaz && c.name && !c.markazTried && process.env.MARKAZ_EMAIL) {   // seeded case: find it in Markaz once
      c.markazTried = true;
      const hit = (await markaz.search(c.name).catch(() => []))[0];
      if (hit) { c.markaz = { candidateId: hit.candidateId, applicationId: hit.id, status: hit.status, position: hit.position, personalEmail: hit.email, phone: hit.phone }; c.employeeEmail ||= hit.officialEmail; }
    }
    await ensureCv(c);
    await ensureContactDraft(c);
    const replies = await readContactThread(c);
    await analyseContacts(c, replies);
    for (const row of c.orgs.filter(r => r.status === 'checking')) await checkAndDraft(c, row);
    for (const row of c.orgs) await followOrg(c, row);
  } catch (e) {
    c.error = e.message;
    store.log(c, 'Error: ' + e.message);
  } finally {
    c.busy = false;
    store.save();
  }
}

// ---------- new hires in Markaz → a case is prepared (nothing is sent) ----------
async function watchNewHires() {
  if (!process.env.MARKAZ_EMAIL) return;
  const st = store.get();
  const hired = await markaz.hiredCandidates();
  if (!st.knownHired) {                                       // first run: remember who is already hired
    st.knownHired = hired.map(h => h.candidateId);
    store.save();
    console.log(`New-hire watch baseline: ${hired.length} already hired`);
    return;
  }
  for (const h of hired) {
    if (st.knownHired.includes(h.candidateId)) continue;
    st.knownHired.push(h.candidateId);
    if (st.cases.some(c => c.markaz?.candidateId === h.candidateId || c.name.toLowerCase() === h.name.toLowerCase())) continue;
    const c = createCase(h, { auto: true });
    if (!c.employeeEmail) store.log(c, 'No official email found in Markaz yet — add it in the app');
  }
  store.save();
}

let polling = false;
async function pollAll() {
  if (polling) return;
  polling = true;
  try {
    await watchNewHires().catch(e => console.error('new hires:', e.message));
    for (const c of store.get().cases.filter(c => !c.archived)) await processCase(c);
    store.get().lastPoll = new Date().toISOString();
    store.save();
  } finally { polling = false; }
}

// ---------- work for the hourly Claude routine ----------
function agentTasks() {
  const tasks = [];
  for (const c of store.get().cases.filter(c => !c.archived)) {
    const f = cvFile(c);
    if (!c.cv && f) tasks.push({ type: 'cv', caseId: c.id, name: c.name, file: `/agent/file/cv/${c.id}`, mime: f.mime });
    if (c.cv && c.pendingReplies) tasks.push({ type: 'contacts', caseId: c.id, name: c.name, ids: c.pendingReplies.ids,
      cv_experience: c.cv.experience.map((e, i) => ({ index: i, ...e })), cv_references: c.cv.cv_references,
      replies: c.pendingReplies.replies.map(r => ({ date: r.date, text: r.text,
        attachments: r.attachments.map(a => ({ filename: a.filename, mimeType: a.mimeType, file: `/agent/file/att/${c.id}/${r.msgId}/${encodeURIComponent(a.filename)}` })) })) });
    for (const o of c.orgs) {
      if (o.status === 'checking') tasks.push({ type: 'check', caseId: c.id, orgKey: o.key, candidate: c.name,
        organization: o.organization, location: o.location, designation_cv: o.designation_cv, designation_per_employee: o.designation_per_employee,
        dates_cv: `${o.start || '?'} – ${o.end || '?'}`, dates_per_employee: `${o.start_per_employee || '?'} – ${o.end_per_employee || '?'}`,
        contact: { name: o.contact_name, title: o.contact_title, email: o.contact_email, phone: o.contact_phone },
        documents: o.documents || [], notes: o.notes, cv_references: c.cv?.cv_references || [] });
      if (o.status === 'replied' && o.reply && !o.reply.verdict) tasks.push({ type: 'reply', caseId: c.id, orgKey: o.key, candidate: c.name,
        organization: o.organization, asked: { designation: o.designation, start: o.start, end: o.end }, reply_text: o.reply.text });
    }
  }
  return tasks;
}

async function applyAgentResult({ type, caseId, orgKey, ids, data }) {
  const c = store.caseById(caseId);
  if (!c) throw new Error('Case not found');
  if (!data || typeof data !== 'object') throw new Error('data missing');
  if (type === 'cv') { if (!Array.isArray(data.experience)) throw new Error('data.experience missing'); applyCv(c, { cv_references: [], consistency_notes: [], ...data }); }
  else if (type === 'contacts') {
    if (!c.cv) throw new Error('CV not read yet');
    if (!Array.isArray(data.organizations)) throw new Error('data.organizations missing');
    applyContacts(c, { cv_entries_without_contact: [], summary: '', ...data }, ids || c.pendingReplies?.ids || []);
  } else if (type === 'check' || type === 'reply') {
    const row = c.orgs.find(o => o.key === orgKey);
    if (!row) throw new Error('Organization not found');
    if (type === 'check') {
      if (row.status !== 'checking') throw new Error('Not waiting for a check');
      if (!['low', 'medium', 'high'].includes(data.risk)) throw new Error('data.risk must be low/medium/high');
      applyCheck(c, row, { red_flags: [], sources: [], ...data });
    } else {
      if (!row.reply) throw new Error('No reply to classify');
      if (!data.verdict) throw new Error('data.verdict missing');
      applyReply(c, row, { differences: [], ...data });
    }
  } else throw new Error('Unknown task type');
  store.save();
  setImmediate(() => processCase(c));
  return c;
}

// What the person needs to know/do, for the list view.
function summary(c) {
  const o = c.orgs;
  const count = s => o.filter(r => s.includes(r.status)).length;
  let stage, action = false;
  if (!c.cv && c.contact.status !== 'replied') stage = c.error ? 'Problem' : 'Reading CV';
  else if (c.contact.status === 'draft') { stage = 'Tap Send: ask employee for contacts'; action = true; }
  else if (c.contact.status === 'sent') stage = 'Waiting for employee';
  else if (c.pendingReplies || count(['checking'])) stage = 'Checking organizations';
  else if (count(['draft', 'error'])) { stage = 'Tap Send: verification emails ready'; action = true; }
  else if (count(['sent', 'reminded'])) stage = 'Waiting for organizations';
  else if (o.length && o.every(r => r.status === 'confirmed' || r.status === 'skipped')) stage = 'Verified ✓';
  else if (o.length) { stage = 'Check replies'; action = true; }
  else stage = c.contact.status === 'replied' ? 'Reading reply' : 'Starting';
  if (count(['not_confirmed', 'needs_more_info', 'bounced', 'partially_confirmed'])) action = true;
  return { stage, action, confirmed: count(['confirmed']), total: o.filter(r => r.status !== 'skipped').length };
}

module.exports = { createCase, processCase, pollAll, sendContact, sendOrg, saveUploadedCv, summary, renderOrgDraft, agentTasks, applyAgentResult, cvFile };
