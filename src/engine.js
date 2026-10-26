// The pipeline. A case moves: new -> scheduled -> review -> done.
//
// Two of those arrows are deliberately not automatic. The invite needs a human to choose a
// time, and the finished record needs a human to look at it before it leaves the building:
// these documents carry harassment disclosures, named allegations and names that reached us
// through a machine transcript, and an automation that forwards those unseen defeats the
// restriction it just printed on the page.
const fs = require('fs');
const cfg = require('./config');
const g = require('./google');
const store = require('./store');
const ai = require('./ai');
const render = require('./render');
const email = require('./email');

const nowIso = () => new Date().toISOString();
const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const addrOf = from => (String(from).match(/<([^>]+)>/)?.[1] || String(from)).trim().toLowerCase();

// Work out who is leaving.
//
// The common shape is not a thread we can read from the From headers. People & Culture
// forward the resignation on with a one-line note, so the only message in our mailbox is
// theirs and the resignation survives only as quoted text underneath. Two of the three
// real cases looked like that. So read the quote headers too, and keep the deepest one -
// the innermost quote is the original author, which is the person leaving.
//
// Mail clients wrap long quoted lines and prefix them with '>', which splits an address
// across lines: "Hamza Siddique <\n>> hamza.siddique@niete.edu.pk> wrote:". Unwrapping
// first is what makes those match at all.
const unwrapQuotes = t => String(t || '').replace(/\n\s*>+\s*/g, ' ');

// The name group forbids digits so the capture cannot swallow the date that precedes it
// in "On Fri, 16 Oct 2026 at 4:59 PM, Waqas Panezai <...>".
const QUOTE_PATTERNS = [
  /On\s[^\n]{0,200}?([^<>\n@0-9:]{2,60}?)\s*<\s*([^<>\s@]+@[^<>\s]+?)\s*>\s*wrote:/g,
  /From:\s*([^<>\n@0-9:]{2,60}?)\s*<\s*([^<>\s@]+@[^<>\s]+?)\s*>/gi,
];

function guessLeaver(messages, trigger) {
  const mine = cfg.SENDER_EMAIL.toLowerCase();
  const hr = new Set(cfg.HR_SENDERS);
  const usable = a => a && a !== mine && !hr.has(a);
  // The date in "On Fri, 16 Oct 2026 at 4:59 PM, Waqas Panezai" is excluded by the
  // no-digit rule, but the meridiem has no digits in it and rides along.
  const clean = n => String(n || '').replace(/["']/g, '').replace(/\s+/g, ' ').trim()
                       .replace(/^(?:AM|PM|at)[\s,]*/i, '')
                       .replace(/^[,;–-]+|[,;–-]+$/g, '').trim();

  // 1. Someone other than us or People & Culture actually sent a message in the thread.
  for (const m of messages) {
    const addr = addrOf(m.from);
    if (usable(addr)) return { name: clean(String(m.from).split('<')[0]), email: addr };
  }

  // 2. Otherwise read the quoted text and keep the last quote header found, since the
  //    deepest quote is the person who started it all.
  for (const m of messages) {
    const body = unwrapQuotes(m.body);
    let found = null;
    for (const re of QUOTE_PATTERNS) {
      re.lastIndex = 0;
      let x;
      while ((x = re.exec(body)) !== null) {
        const addr = String(x[2]).trim().toLowerCase();
        const name = clean(x[1]);
        if (usable(addr) && name) found = { name, email: addr };
      }
    }
    if (found) return found;
  }
  return { name: '', email: '' };
}

// A short nudge to Tahir at the two points a case is actually waiting on him. Sent to
// his own mailbox, so the phone notification he already gets does the work - no new app,
// and it runs on Railway, so it reaches him whether or not the laptop is on.
//
// Each kind is sent at most once per case: a case can be polled many times in the state
// that triggers it, and a repeat every fifteen minutes would quickly be ignored.
async function notify(id, kind) {
  if (!cfg.NOTIFY) return;
  const c = store.get(id);
  if (!c) return;
  const sentAlready = c.notified || {};
  if (sentAlready[kind]) return;

  const link = cfg.APP_URL;
  const who = `${c.leaver.name || 'Someone'}${c.leaver.role ? ' &mdash; ' + c.leaver.role : ''}`;
  let subject, body;

  if (kind === 'new') {
    subject = `Exit interview to schedule - ${c.leaver.name || 'new resignation'}`;
    body = `<p><b>${who}</b> has resigned. The case is open and waiting for a time.</p>`
         + (c.lastWorkingDay ? `<p>Last working day: ${c.lastWorkingDay}</p>` : '')
         + (c.request?.from ? `<p>Flagged by ${String(c.request.from).replace(/<.*>/, '').trim()}</p>` : '')
         + (c.needsTriage ? '<p>The name could not be read out of the thread yet - check it before sending the invite.</p>' : '')
         + `<p><a href="${link}">Pick a time and send the invite</a></p>`;
  } else if (kind === 'review') {
    const r = c.restrictedSections || [];
    const gaps = (c.record && c.record.gaps) || [];
    subject = `Exit interview record ready - ${c.leaver.name || 'record'}`;
    body = `<p>The record for <b>${who}</b> is drafted and waiting for you to read it.</p>`
         + (r.length ? `<p style="color:#8a2020"><b>Section ${r.join(', ')} is restricted</b> - read it before sending.</p>` : '')
         + (gaps.length ? `<p>${gaps.length} thing${gaps.length > 1 ? 's' : ''} the record could not establish ${gaps.length > 1 ? 'are' : 'is'} flagged on the card.</p>` : '')
         + `<p><a href="${link}">Read the draft and send it</a></p>`;
  } else {
    return;
  }

  try {
    await g.send({ to: cfg.SENDER_EMAIL, subject, html: body });
    store.update(id, { notified: { ...sentAlready, [kind]: new Date().toISOString() } });
    store.log(id, `Nudge sent: ${kind}`);
  } catch (e) {
    // A failed nudge must never hold up the case itself.
    store.log(id, `Nudge failed (${kind}): ${e.message}`);
  }
}

// ---------------------------------------------------------------- what counts as one

// A resignation subject line. Unambiguous on its own: nobody titles a mail "Resignation"
// about anything else.
const SUBJECT_SAYS = /resignation|resigning|resigned|exit interview|last working day|offboarding/i;

// Somebody stating that they, or a named person, are leaving. The distinction that makes
// body matching usable at all is grammatical: a real resignation is a SENTENCE about a
// departure ("my resignation", "she has resigned", "my last working day is"), while the
// look-alikes only mention the word about somebody's other job - an offer letter asks for
// "your resignation from your current employer", a policy explains what happens "on
// resignation". Neither phrasing can produce any of the forms below.
const BODY_SAYS = new RegExp([
  /my resignation/,
  /(submit|submitting|tender|tendering|attach|attaching)\s+(my|his|her|their)\s+resignation/,
  /accept(ing|ed)?\s+(my|his|her|their)\s+resignation/,
  /i\s+(hereby\s+)?resign\b/,
  /i\s+am\s+resigning/,
  /(resign|resigning)\s+from\s+my\b/,
  /has\s+(resigned|tendered)\b/,
  /(is|are)\s+resigning/,
  /my\s+last\s+(working\s+)?day/,
  /notice\s+of\s+resignation/,
  /letter\s+of\s+resignation/,
].map(r => r.source).join('|'), 'i');

// Being asked to run one, which is the other way this arrives: a colleague forwards the
// leaver's mail and writes a line on top. The forwarded part usually carries the wording
// BODY_SAYS wants, but not always - sometimes the whole request is that covering line.
const ASKS_FOR_ONE = /\b(exit\s*interview|offboard(ing)?\s+(call|session|interview))\b/i;

// Our own finished record, which we mail out under this exact subject. It leaves the
// original thread behind, so thread de-duplication does not catch it, and every term the
// matcher looks for is quoted inside it - left alone it would open a second case for
// somebody whose interview is already filed.
const OUR_OWN_RECORD = /^\s*((re|fwd|fw)\s*:\s*)*exit interview record\b/i;

// The subjects this app writes. Belt and braces behind the header: it catches the ones
// already sitting in the mailbox from before the header existed, and the case where one of
// our mails comes back as a forward with the header stripped.
const AGENT_SUBJECTS = new RegExp('^\\s*((re|fwd|fw)\\s*:\\s*)*(' + [
  'exit interview to schedule',
  'exit interview record ready',
  'exit interview record\\b',
  'exit interview agent (has stopped working|is working again)',
  'someone is guessing the exit interview pin',
].join('|') + ')', 'i');

// Read a generous slice of the body: on a forward the leaver's own words sit below the
// covering note, and on a long thread below the quoted history.
function looksLikeResignation(msg) {
  // Anything this app sent. Its nudges and alerts land in the same mailbox it watches and
  // carry wording like "Exit interview to schedule", so without this the app reads its own
  // post, opens a case, nudges about it, and opens another - which is exactly what
  // happened. The header is set on everything we send, so this covers alerts and anything
  // added later, not just the messages that caused it.
  if (msg.fromAgent) return false;
  // Records sent before the header existed, and our own mail quoted back by someone else.
  if (OUR_OWN_RECORD.test(msg.subject || '')) return false;
  if (AGENT_SUBJECTS.test(msg.subject || '')) return false;
  if (SUBJECT_SAYS.test(msg.subject || '')) return true;
  const body = String(msg.body || '').slice(0, 12000);
  return BODY_SAYS.test(body) || ASKS_FOR_ONE.test(body);
}

// ---------------------------------------------------------------- stage 1: HR requests

async function scanRequests() {
  // Any resignation in the mailbox opens a case, whoever sent it - people resign to HR, to
  // their manager, or to a list, and waiting for People & Culture to reply first means the
  // scheduling only starts days later. Thread de-duplication below is what makes this
  // safe: a resignation, every reply to it and our own answer all share one thread and
  // collapse into a single case.
  //
  // The keywords go in the Gmail query rather than being filtered afterwards, because a
  // broad search fills its result page with unrelated mail and pushes the real one off the
  // end. Notetaker summaries are excluded - they quote the word while recapping a meeting -
  // and so are calendar replies, which match "Exit Interview" but are not requests.
  // The search covers the whole message, not just the subject, because a resignation does
  // not always announce itself there: it can sit in the body, or arrive as a forward whose
  // subject is somebody else's words. What the search returns is only a shortlist though -
  // looksLikeResignation below decides. Matching the bare WORD in a body was measured at 5
  // junk cases out of 7; matching a resignation SENTENCE was measured over the same mailbox
  // across 200 days and rejected all twelve look-alike threads - offer letters ("resignation
  // from your current employer"), leave policy, assets handover - while keeping every real
  // one.
  const terms = '(resignation OR resigning OR resigned OR "exit interview" OR "last working day" OR offboarding)';
  const notNote = cfg.NOTETAKER_SENDERS.map(s => `-from:${s}`).join(' ');
  const notCal = '-subject:"Accepted:" -subject:"Declined:" -subject:"Invitation:" -subject:"Updated invitation"';
  const q = `newer_than:45d ${terms} ${notNote} ${notCal}`;
  const ids = await g.search(q, 30);
  let found = 0;

  for (const { id } of ids) {
    if (store.seen(id)) continue;
    const msg = await g.message(id);

    if (!looksLikeResignation(msg)) {
      store.markSeen(id);
      continue;
    }

    // Read the whole thread: the request is a reply and does not name the leaver.
    let messages;
    try { messages = await g.thread(msg.threadId); }
    catch (e) { console.error('thread', e.message); continue; }

    // Skip a thread we already opened a case for - the request and any follow-ups all
    // share it, and each would otherwise look like a fresh request.
    if (store.all().some(c => c.request?.threadId === msg.threadId)) { store.markSeen(id); continue; }

    // Opening the case must not depend on the model. Where this deployment has no API key
    // the writing is done by the scheduled routine, and if case creation needed a model
    // call too, nothing would ever appear for the routine to work on. So the case is
    // opened now with a best-effort guess, and the details are completed afterwards -
    // by the routine, or by whoever is looking at the phone, who checks them anyway
    // before an invite goes out.
    store.markSeen(id);

    const guess = guessLeaver(messages, msg);
    let parsed = null;
    if (ai.ready()) {
      try { parsed = await ai.readRequest(messages); }
      catch (e) { console.error('readRequest', e.message); }
      if (parsed && !parsed.isExitInterviewRequest) continue;
    }

    const leaver = {
      name: parsed?.leaverName || guess.name || '',
      email: parsed?.leaverEmail || guess.email || '',
      role: parsed?.role || '',
    };

    const saved = store.save({
      id: newId(),
      stage: 'new',
      createdAt: nowIso(), updatedAt: nowIso(),
      leaver,
      lastWorkingDay: parsed?.lastWorkingDay || '',
      suggestedDate: parsed?.suggestedDate || '',
      notes: parsed?.notes || '',
      // Flag for the routine when nothing filled the details in. The thread is kept so it
      // has something to read; bodies are trimmed to keep the case file small.
      needsTriage: !parsed && !leaver.name,
      requestThread: messages.map(m => ({
        from: m.from, to: m.to, cc: m.cc, date: m.date, subject: m.subject, body: m.body.slice(0, 6000),
      })),
      request: { messageId: id, threadId: msg.threadId, rfc822: msg.messageId, from: msg.from, subject: msg.subject, date: msg.date },
      log: [{ at: nowIso(), line: `Request picked up from ${msg.from}` }],
    });
    found++;
    await notify(saved.id, 'new');
  }
  return { found };
}

// ---------------------------------------------------------------- stage 2: invite (user-triggered)

async function sendInvite(id, { startIso, durationMinutes }) {
  const c = store.get(id);
  if (!c) throw new Error('No such case');
  if (!c.leaver.email) throw new Error('No email address for the leaver - add one first');

  const start = new Date(startIso);
  const end = new Date(start.getTime() + (durationMinutes || cfg.INTERVIEW_MINUTES) * 60000);
  // The leaver, whoever flagged the resignation, and the notetaker. The notetaker has to
  // be invited or it never joins, and without it there is no summary afterwards and the
  // drafting stage has nothing to read.
  const attendees = [c.leaver.email, recipientFor(c), ...cfg.RECORD_CC, ...cfg.NOTETAKER_INVITE]
    .map(a => String(a || '').trim().toLowerCase())
    .filter((v, i, a) => v && a.indexOf(v) === i);

  const ev = await g.createInvite({
    summary: `Exit Interview | ${c.leaver.name}`,
    // Read by the person who has just resigned. Two things belong here that were missing:
    // who they will be speaking to, and the fact that a notetaker joins and records. They
    // will see it in the call either way, and finding out then - rather than now - is the
    // difference between a conversation they agreed to and one that was taken from them.
    description:
      `A conversation about your time here - what worked, what did not, and anything you `
      + `would like flagged to the organisation. ${cfg.SENDER_NAME} will be speaking with you, `
      + `and it should take about ${durationMinutes || cfg.INTERVIEW_MINUTES} minutes.\n\n`
      + 'A notetaker joins the call and records it. The notes are used to write up a record '
      + 'for People & Culture; the recording itself is not circulated. Tell us at the start '
      + 'if you would rather it was not recorded.\n\n'
      + 'Nothing you say here is tied to your clearance, your final settlement or your '
      + 'references. You do not have to answer anything you would prefer not to.',
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    attendees,
  });

  store.update(id, {
    stage: 'scheduled',
    interview: { startIso: start.toISOString(), endIso: end.toISOString(), eventId: ev.id, link: ev.hangoutLink || '' },
  });
  store.log(id, `Invite sent to ${attendees.join(', ')}`);
  return store.get(id);
}

// ---------------------------------------------------------------- stage 3: notetaker summaries

// Matches a notetaker email to a scheduled interview by surname and timing. Being strict
// here matters: attaching the wrong meeting's notes to a person would be a serious error,
// so an unmatched summary is left for the interviewer to attach by hand.
function looksLikeTheirs(msg, c) {
  const when = new Date(c.interview.startIso).getTime();
  const sent = new Date(msg.date).getTime();
  if (!(sent >= when - 3600e3 && sent <= when + cfg.NOTES_WAIT_HOURS * 3600e3)) return false;
  const parts = c.leaver.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const hay = (msg.subject + ' ' + msg.body.slice(0, 4000)).toLowerCase();
  return parts.length > 0 && parts.every(w => hay.includes(w));
}

async function scanNotes() {
  const waiting = store.all().filter(c => c.stage === 'scheduled' && c.interview);
  if (!waiting.length) return { matched: 0 };

  const q = `newer_than:7d (${cfg.NOTETAKER_SENDERS.map(s => `from:${s}`).join(' OR ')})`;
  const ids = await g.search(q, 30);
  let matched = 0;

  for (const c of waiting) {
    // Start looking once the interview is under way, not once its booked hour is up.
    // Waqas's ran short and Fathom's recap arrived half an hour before the slot ended, so
    // waiting for endIso left a finished record sitting unnoticed. A summary cannot exist
    // unless the meeting happened, and the name-and-timing match below is what keeps the
    // wrong meeting's notes off a case.
    if (new Date(c.interview.startIso).getTime() + 10 * 60000 > Date.now()) continue;
    const sources = [];
    for (const { id } of ids) {
      const msg = await g.message(id);
      if (looksLikeTheirs(msg, c)) {
        sources.push({ label: msg.subject, from: msg.from, date: msg.date, body: msg.body, messageId: id });
      }
    }
    if (!sources.length) continue;

    store.update(c.id, { stage: 'drafting', sources });
    store.log(c.id, `Found ${sources.length} notetaker summary/summaries`);
    matched++;

    // Draft here only if this deployment has its own API key. Otherwise the case waits in
    // 'drafting' and the scheduled Claude Code routine picks it up from /agent/tasks - same
    // rules, same template, no second subscription to pay for.
    if (!ai.ready()) {
      store.log(c.id, 'Queued for the Claude Code routine');
      continue;
    }
    try { await draft(c.id); }
    catch (e) {
      store.update(c.id, { stage: 'error', error: e.message });
      store.log(c.id, 'Draft failed: ' + e.message);
    }
  }
  return { matched };
}

// ---------------------------------------------------------------- stage 4: draft

const longDate = iso => new Date(iso).toLocaleDateString('en-GB',
  { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' });

async function draft(id) {
  const c = store.get(id);
  if (!c) throw new Error('No such case');
  if (!ai.ready()) throw new Error('No API key here - this case is queued for the Claude Code routine');
  if (!c.sources || !c.sources.length) throw new Error('No notetaker summary attached yet');

  const rec = await ai.writeRecord({
    leaverName: c.leaver.name,
    role: c.leaver.role,
    interviewDate: longDate(c.interview?.startIso || Date.now()),
    interviewer: cfg.SENDER_NAME,
    sources: c.sources,
  });
  return applyRecord(id, rec);
}

// Shared by both drafting paths: the model's structured record becomes the HTML and the
// PDF, and the case moves to review. Keeping it in one place is what guarantees a record
// written by the routine is identical to one the app wrote itself.
// Correcting the draft from the phone. Tahir reads every record before it is sent, and
// until now the only way to change a line was to open the laptop and redraft - which meant
// either sending something he was not happy with or letting it wait. A record is also the
// one document here that genuinely needs a human hand: the model works from a notetaker's
// paraphrase, and the person who was actually in the room is the only one who can tell it
// got a sentence wrong.
//
// Only the fields that carry text are editable. The structure - how many sections exist,
// what the schema is - stays as drafted; this is for fixing words, not rebuilding the
// document. Everything is re-rendered afterwards, so the PDF he re-reads is the PDF that
// gets filed.
const TEXT_FIELDS = ['name', 'role', 'tenure', 'dateMode', 'separation', 'reasonsLead'];
const LIST_FIELDS = ['reasons', 'strengths', 'requests'];
const clean = v => String(v == null ? '' : v).trim();

async function editRecord(id, patch) {
  const c = store.get(id);
  if (!c) throw new Error('No such case');
  if (!c.record) throw new Error('There is no draft to edit yet');
  // Once a record has been filed and mailed, editing it here would only make this copy
  // disagree with the PDF already sitting in Drive and in somebody's inbox - and because
  // re-rendering returns the case to 'review', it would also invite a second send of a
  // record that has already gone.
  if (c.stage === 'done' && !c.dismissed) {
    throw new Error('This record has already been filed and sent - it cannot be edited here');
  }
  const rec = JSON.parse(JSON.stringify(c.record));
  const p = patch || {};

  for (const k of TEXT_FIELDS) if (p[k] !== undefined) rec[k] = clean(p[k]);
  // Blank lines are how a bullet gets deleted on a phone - the whole list is one textarea.
  for (const k of LIST_FIELDS) {
    if (p[k] === undefined) continue;
    rec[k] = (Array.isArray(p[k]) ? p[k] : String(p[k]).split('\n')).map(clean).filter(Boolean);
  }
  if (Array.isArray(p.facts)) {
    p.facts.slice(0, 4).forEach((v, i) => { if (v !== undefined) rec.facts[i] = clean(v); });
  }
  // Sections and named people are matched by index against what was drafted, so an edit
  // cannot silently reorder them or introduce one the model never wrote.
  if (Array.isArray(p.flags)) {
    p.flags.forEach((f, i) => {
      if (!f || !rec.flags[i]) return;
      if (f.title !== undefined) rec.flags[i].title = clean(f.title);
      if (f.body !== undefined) rec.flags[i].body = clean(f.body);
      if (f.quote !== undefined) rec.flags[i].quote = clean(f.quote);
      if (f.restricted !== undefined) rec.flags[i].restricted = !!f.restricted;
    });
  }
  if (Array.isArray(p.named)) {
    p.named.forEach((n, i) => {
      if (!n || !rec.named[i]) return;
      if (n.what !== undefined) rec.named[i].what = clean(n.what);
      if (n.register !== undefined && ['adverse', 'neutral', 'positive'].includes(n.register)) {
        rec.named[i].register = n.register;
      }
    });
  }
  if (!clean(rec.name)) throw new Error('The record needs a name on it');

  store.log(id, 'Draft edited by hand');
  return applyRecord(id, rec);
}

async function applyRecord(id, rec) {
  const c = store.get(id);
  if (!c) throw new Error('No such case');
  const date = new Date(c.interview?.startIso || Date.now());
  const dateLong = longDate(date);

  const html = render.buildHtml(rec, { interviewer: cfg.SENDER_NAME, dateLong });
  const pdf = await render.toPdf(html, { name: rec.name });

  fs.writeFileSync(store.htmlPath(id), html);
  fs.writeFileSync(store.pdfPath(id), pdf);

  store.update(id, {
    stage: 'review',
    record: rec,
    filename: render.fileName(rec.name, date.toISOString().slice(0, 10)),
    pdfBytes: pdf.length,
    restrictedSections: rec.flags.filter(f => f.restricted).map(f => f.number),
  });
  store.log(id, `Draft ready (${Math.round(pdf.length / 1024)} KB)`);
  await notify(id, 'review');
  return store.get(id);
}

// Who the finished record goes back to. Anyone may be the one who notices a resignation
// and tells Tahir, so this follows the thread rather than a fixed address - except for the
// one case that must never happen. When the leaver started the thread themselves, replying
// to the sender would hand them a record naming their own manager, so it falls back to
// People & Culture instead.
// Every address in a header line, not just the first.
const addrsIn = v => (String(v || '').match(/[^\s<>,;"]+@[^\s<>,;"]+/g) || [])
  .map(a => a.replace(/[.,;]+$/, '').toLowerCase());

// Addresses nothing should ever be sent to: us, the notetakers, and the automated senders
// that end up on these threads.
const AUTOMATED = /^(no-?reply|do-?not-?reply|postmaster|mailer-daemon|calendar-notification)@|@resource\.calendar\.google\.com$/i;

// Wide internal lists. A resignation is sometimes sent to one of these, and replying to
// all on that thread would put a confidential exit record - names, allegations, sometimes
// a harassment disclosure - in front of the whole organisation. They are left out and
// named in the log, so they can be added back by hand if one of them really is meant to
// have it.
const BROADCAST = /^(all|everyone|everybody|staff|team|employees|colleagues|announce|general|info)([-._].*)?@/i;

// The leaver may appear on the thread under more than the one address we recorded - a
// personal account as well as a work one. Addresses are firstname.lastname here, so a
// local part built from their name catches the second address. Dropping a same-named
// colleague by mistake is recoverable; sending someone their own exit record is not.
function leaverAddresses(c) {
  const out = new Set();
  const known = String(c.leaver?.email || '').trim().toLowerCase();
  if (known) out.add(known);
  const parts = String(c.leaver?.name || '').toLowerCase().match(/[a-z]+/g) || [];
  if (parts.length >= 2) {
    const first = parts[0], last = parts[parts.length - 1];
    for (const lp of [`${first}.${last}`, `${first}${last}`, `${first}_${last}`]) out.add('local:' + lp);
  }
  return out;
}

const isLeaver = (addr, leaverSet) =>
  leaverSet.has(addr) || leaverSet.has('local:' + addr.split('@')[0]);

// Everyone on the request thread, minus the people who must not be on the reply. This is
// what "reply all" means here: the record goes back into the conversation it was asked for
// in, so whoever was already part of it - People & Culture, the manager who flagged it,
// anyone added along the way - sees it without being copied in by hand afterwards.
function threadAudience(c, messages) {
  const leaverSet = leaverAddresses(c);
  const mine = cfg.SENDER_EMAIL.toLowerCase();
  const notetakers = new Set(cfg.NOTETAKER_SENDERS.map(s => s.toLowerCase()));
  const kept = [];
  const dropped = { leaver: [], broadcast: [] };

  for (const m of messages || []) {
    for (const a of [...addrsIn(m.from), ...addrsIn(m.to), ...addrsIn(m.cc)]) {
      if (a === mine || notetakers.has(a) || AUTOMATED.test(a)) continue;
      if (isLeaver(a, leaverSet)) { if (!dropped.leaver.includes(a)) dropped.leaver.push(a); continue; }
      if (BROADCAST.test(a)) { if (!dropped.broadcast.includes(a)) dropped.broadcast.push(a); continue; }
      if (!kept.includes(a)) kept.push(a);
    }
  }
  return { kept, dropped };
}

// What the card shows as the copy list. Same rule publish uses, against the stored thread.
// Once the record is filed, the raw material behind it has no reason to stay.
//
// Until this ran, cases.json held the notetaker's whole summary - the substance of the
// conversation, named allegations and all - plus the full text of every message on the
// thread, indefinitely, on a volume with no retention policy and no backup discipline.
// That is a quietly growing liability and nothing was using it.
//
// What is kept: the structured record (it is the document, and a correction has to be
// written from it), who it went to, and the Drive link. What goes: the notetaker summaries
// and the message bodies. Headers are kept so the thread can still be reasoned about.
function purgeRawContent(id) {
  const c = store.get(id);
  if (!c) return;
  const patch = {};
  if (c.sources?.length) {
    patch.sources = c.sources.map(s => ({ label: s.label, from: s.from, date: s.date, purged: true }));
  }
  if (c.requestThread?.length) {
    patch.requestThread = c.requestThread.map(m =>
      ({ from: m.from, to: m.to, cc: m.cc, date: m.date, subject: m.subject, purged: true }));
  }
  if (!Object.keys(patch).length) return;
  store.update(id, patch);
  store.log(id, 'Notetaker summaries and message bodies cleared - the filed record is the record now');
}

// A case that should never have been opened: the app reading its own post, or a thread
// that turned out not to be a resignation at all. Dismissing leaves it in the list and in
// the counts, which is right for a real resignation nobody wants an interview about and
// wrong for noise.
//
// Refused once a record exists. By then it is an HR document, and whether it is kept is
// not a question this button should be able to answer.
function discard(id) {
  const c = store.get(id);
  if (!c) throw new Error('No such case');
  if (c.record || c.drive) {
    throw new Error('A record has been written for this case - it cannot be thrown away here');
  }
  const name = c.leaver?.name || c.request?.subject || id;
  if (!store.remove(id)) throw new Error('Nothing was removed');
  return { removed: true, id, was: name };
}

// An interview that happened before this app existed, where there is no case to mark.
// Naveera's was one: her record was written and filed, but no email ever came through the
// app, so the list said three interviews and the register said four. The counts have to
// agree or neither is trusted.
function backfill({ name, role, email, interviewDate, driveLink, fileId, requestedBy } = {}) {
  const who = String(name || '').trim();
  if (!who) throw new Error('A name is required');
  if (!driveLink) throw new Error('A link to the filed record is required');
  const already = store.all().find(c =>
    (c.leaver?.name || '').trim().toLowerCase() === who.toLowerCase());
  if (already) throw new Error(`There is already a case for ${who}`);

  const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(interviewDate || ''))
    ? new Date(interviewDate + 'T10:00:00Z').toISOString()
    : nowIso();

  const c = store.save({
    id: newId(),
    stage: 'done',
    handledOutside: true,
    dismissed: false,
    leaver: { name: who, role: role || '', email: email || '' },
    interview: { startIso: iso },
    drive: { id: fileId || null, link: driveLink },
    request: requestedBy ? { from: requestedBy } : {},
    createdAt: nowIso(),
    log: [{ at: nowIso(), line: 'Added from a record that was filed before the app existed' }],
  });
  return c;
}

// An interview that was held and written up outside this app. Three were - Naveera, Sara
// and Hamza, all before it existed - and the only thing the app could be told about them
// was "dismissed", which reads as though nothing happened. This records what actually did:
// the interview took place, the record is filed, here is where.
async function markFiled(id, { interviewDate, driveLink, fileId } = {}) {
  const c = store.get(id);
  if (!c) throw new Error('No such case');
  if (!driveLink) throw new Error('A link to the filed record is required');
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(interviewDate || ''))
    ? new Date(interviewDate + 'T10:00:00Z').toISOString()
    : (c.interview?.startIso || nowIso());
  store.update(id, {
    stage: 'done',
    dismissed: false,
    handledOutside: true,
    interview: { ...(c.interview || {}), startIso: iso },
    drive: { id: fileId || null, link: driveLink },
  });
  store.log(id, `Marked as held and filed outside the app (${driveLink})`);
  purgeRawContent(id);
  return store.get(id);
}

// The register: every interview that has actually been filed. The name and date come back
// out of the filename the app writes them into, so a record filed before any of this
// existed shows up too, provided it went through uploadFile.
const REGISTER_NAME = /^Exit_Interview_Record_(.+?)_(\d{4}-\d{2}-\d{2})\.pdf$/i;

async function register() {
  const files = await g.listFolder(cfg.DRIVE_FOLDER_ID);
  const cases = store.all();
  const rows = files.map(f => {
    const m = REGISTER_NAME.exec(f.name);
    const name = m ? m[1].replace(/_/g, ' ') : f.name.replace(/\.pdf$/i, '').replace(/_/g, ' ');
    const date = m ? m[2] : (f.createdTime || '').slice(0, 10);
    // Match the filed record back to its case, where there is one, so the register can
    // link to the role and to who asked for it.
    const c = cases.find(x => (x.record?.name || x.leaver?.name || '').toLowerCase() === name.toLowerCase());
    return {
      name, date, link: f.webViewLink, fileId: f.id,
      kb: f.size ? Math.round(Number(f.size) / 1024) : null,
      role: c?.record?.role || c?.leaver?.role || '',
      caseId: c?.id || null,
      restricted: c?.restrictedSections || [],
    };
  });
  rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { count: rows.length, folder: cfg.DRIVE_FOLDER_ID, rows };
}

function ccPreview(c) {
  const to = recipientFor(c);
  const { kept } = threadAudience(c, c.requestThread || []);
  return [...new Set([...kept, ...cfg.RECORD_CC.map(a => a.toLowerCase())])].filter(a => a && a !== to);
}

function recipientFor(c) {
  const from = addrOf(c.request?.from || '');
  const leaver = String(c.leaver?.email || '').trim().toLowerCase();
  const mine = cfg.SENDER_EMAIL.toLowerCase();
  if (from && from !== leaver && from !== mine) return from;
  return cfg.RECORD_TO;
}

// ---------------------------------------------------------------- stage 5: file + send (user-triggered)

async function publish(id, opts = {}) {
  const c = store.get(id);
  if (!c) throw new Error('No such case');
  if (c.stage !== 'review') throw new Error('This case is not waiting for review');
  if (!fs.existsSync(store.pdfPath(id))) throw new Error('The PDF is missing - re-draft first');

  // Settle every recipient before anything leaves the machine. Doing any of this after the
  // Drive upload would mean a rejected address still left a copy of a confidential record
  // filed in the folder.
  const to = String(opts.to || recipientFor(c)).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error('Not a valid email address: ' + to);

  // Reply to everyone on the request thread, not to a fixed list. The thread is re-read
  // now rather than reused from when the case opened, because people get added to these
  // conversations in between and a record that misses them has to be forwarded by hand.
  let audience = c.requestThread || [];
  try { audience = await g.thread(c.request.threadId); }
  catch (e) { store.log(id, 'Could not re-read the thread, using the copy from when the case opened: ' + e.message); }
  const { kept, dropped } = threadAudience(c, audience);
  if (dropped.broadcast.length) {
    store.log(id, `Left off the reply (wide list): ${dropped.broadcast.join(', ')}`);
  }

  // People & Culture are always on it, whether or not they happened to be on the thread.
  const ccList = [...new Set([...kept, ...cfg.RECORD_CC.map(a => a.toLowerCase())])]
    .filter(a => a && a !== to);
  const cc = (opts.cc !== undefined
    ? addrsIn(opts.cc).filter(a => a !== to)
    : ccList).join(', ');

  // The one person this document must never reach is its subject. Everything above filters
  // them out; this proves it, and it runs before a single byte is uploaded or sent.
  const leaverSet = leaverAddresses(c);
  for (const a of [to, ...addrsIn(cc)]) {
    if (isLeaver(a, leaverSet)) {
      throw new Error(`${a} is the leaver's own address - the record cannot go there`);
    }
  }

  const pdf = fs.readFileSync(store.pdfPath(id));
  const drive = await g.uploadFile(c.filename, pdf, 'application/pdf', cfg.DRIVE_FOLDER_ID);

  // Only the PDF is filed. The HTML is still rendered - it is what the PDF is printed
  // from, and it stays on the volume for a re-render - but two files in the folder for
  // one record was clutter, and the PDF is what anyone actually opens.

  // Give everyone on the reply read access to the Drive copy. Without this they hit
  // "request access" the moment they follow the link, and the record stalls on Tahir
  // approving each one by hand - which is the whole thing this is meant to avoid.
  for (const who of [to, ...addrsIn(cc)]) {
    try {
      const as = await g.shareWithReader(drive.id, who);
      store.log(id, `Shared with ${who} (${as}) as reader`);
    } catch (e) {
      store.log(id, `Could not share with ${who}: ${e.message}`);
    }
  }

  await g.send({
    to,
    cc: cc || undefined,
    subject: `Exit Interview Record - ${c.leaver.name}`,
    threadId: c.request.threadId,
    inReplyTo: c.request.rfc822,
    html: email.recordEmail({
      name: c.leaver.name,
      role: c.leaver.role,
      interviewDate: longDate(c.interview?.startIso || Date.now()),
      driveLink: drive.webViewLink,
      filename: c.filename,
      restricted: c.restrictedSections || [],
      note: opts.note,
      sender: cfg.SENDER_NAME,
      senderLine: 'People & Culture · Taleemabad (NIETE)',
    }),
    attachments: [{ filename: c.filename, mime: 'application/pdf', content: pdf }],
  });

  store.update(id, {
    stage: 'done', sentTo: to, sentCc: addrsIn(cc), sentAt: nowIso(),
    drive: { id: drive.id, link: drive.webViewLink },
  });
  purgeRawContent(id);
  store.log(id, `Filed in Drive and emailed to ${to}${cc ? ' cc ' + cc : ''}`);
  return store.get(id);
}

// Closing a case without acting on it. Needed for threads the agent opened that are not
// live work - a historical request, or something it misread. Without this the only way to
// clear one would be editing the volume by hand.
function dismiss(id, reason) {
  const c = store.get(id);
  if (!c) throw new Error('No such case');
  if (c.stage === 'done') return c;
  // Remember where it was so a mis-tap can be undone - dismiss is one tap and the cases
  // it closes are real work.
  store.update(id, { stage: 'done', dismissed: true, prevStage: c.stage,
                     needsTriage: false, dismissReason: reason || '' });
  store.log(id, 'Dismissed' + (reason ? ': ' + reason : ''));
  return store.get(id);
}

function reopen(id) {
  const c = store.get(id);
  if (!c) throw new Error('No such case');
  if (!c.dismissed) throw new Error('Only a dismissed case can be reopened');
  const back = c.prevStage || 'new';
  store.update(id, { stage: back, dismissed: false, prevStage: null, dismissReason: '',
                     needsTriage: back === 'new' && !c.leaver.name });
  store.log(id, 'Reopened');
  return store.get(id);
}

// ---------------------------------------------------------------- poll

// A poll that throws used to go to console.error and no further, which meant an expired
// Google token, a revoked scope or a broken Chromium looked exactly like "no resignations
// came in" - and could stay that way for weeks. The whole point of this app is that nobody
// has to remember to check it, so it has to say when it has stopped working.
//
// One mail, not one per failure: these fail every fifteen minutes once they start. It goes
// after the third consecutive failure, so a single timeout stays quiet, and the counter
// resets on the first good poll - which also sends the all-clear, because knowing it is
// working again matters as much as knowing it broke.
const health = { fails: 0, alerted: false, lastError: null, lastOk: null };
const ALERT_AFTER = 3;

async function reportHealth(err) {
  if (err) {
    health.fails++;
    health.lastError = err.message;
    if (health.fails < ALERT_AFTER || health.alerted) return;
    health.alerted = true;
    await sendPlain(
      'Exit interview agent has stopped working',
      `<p>The agent has failed ${health.fails} polls in a row and is no longer picking up`
      + ' resignations or notetaker summaries.</p>'
      + `<p style="color:#8a2020"><b>${esc(err.message)}</b></p>`
      + '<p>The usual causes are an expired Google token, a revoked scope, or the service'
      + ' being down. Nothing is lost - it catches up once it is working again.</p>'
      + `<p><a href="${cfg.APP_URL}">Open the app</a></p>`,
    );
    return;
  }
  health.lastOk = nowIso();
  if (!health.alerted) { health.fails = 0; return; }
  health.alerted = false;
  health.fails = 0;
  await sendPlain('Exit interview agent is working again',
    '<p>The agent polled successfully. Anything that arrived while it was down has been'
    + ' picked up.</p>');
}

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Used for the health mails. Deliberately separate from notify(), which is per case.
async function sendPlain(subject, html) {
  if (!cfg.NOTIFY) return;
  try { await g.send({ to: cfg.SENDER_EMAIL, subject, html }); }
  catch (e) { console.error('health mail failed:', e.message); }
}

// Somebody is working through PINs. Worth saying out loud once: the only thing between a
// stranger and these records is that number, and if it is being guessed it should be
// changed rather than waited out.
async function alertPinAttack(client, misses) {
  await sendPlain('Someone is guessing the exit interview PIN',
    `<p><b>${misses} wrong PINs</b> from <code>${esc(client)}</code>. That address is locked`
    + ' out for fifteen minutes.</p>'
    + '<p>If this was not you, change <code>APP_PIN</code> in Railway now. The app holds'
    + ' exit interview records, so the PIN is the only thing protecting them.</p>');
}

let polling = false;
async function pollAll() {
  if (polling) return { skipped: true };
  polling = true;
  try {
    const a = await scanRequests();
    const b = await scanNotes();
    await reportHealth(null);
    return { requests: a, notes: b, at: nowIso(), health: healthSummary() };
  } catch (e) {
    await reportHealth(e);
    throw e;
  } finally { polling = false; }
}

const healthSummary = () => ({
  failingSince: health.fails ? health.fails + ' consecutive failures' : null,
  lastError: health.fails ? health.lastError : null,
  lastOk: health.lastOk,
  alerted: health.alerted,
});

// ---------------------------------------------------------------- the Claude Code routine
//
// Where no API key is configured, the writing is done by a scheduled Claude Code routine
// instead: it reads this list, writes the record, and posts it back. The rules travel with
// the task so the routine and the app are always writing to the same specification.

function agentTasks() {
  const triage = store.all()
    .filter(c => c.needsTriage && c.requestThread && c.requestThread.length)
    .map(c => ({
      type: 'triage',
      caseId: c.id,
      instruction:
        'Work out who is leaving. These threads normally start with the departing person '
        + 'emailing their own resignation, after which People & Culture replies asking for an '
        + 'exit interview to be arranged - and that reply does not name them. The name, work '
        + 'email, role and last working day are usually in the resignation, which may only '
        + 'survive as quoted text underneath the reply. Read the quoted text. Return only what '
        + 'the thread actually says; use an empty string where it does not say, and never '
        + 'invent an address. Set isExitInterviewRequest false for unrelated HR traffic such '
        + 'as job applications or offer letters.',
      returnShape: {
        isExitInterviewRequest: 'boolean',
        leaverName: 'string', leaverEmail: 'string', role: 'string',
        lastWorkingDay: 'string', suggestedDate: 'yyyy-mm-dd or empty', notes: 'string',
      },
      thread: c.requestThread,
    }));

  const records = store.all()
    .filter(c => c.stage === 'drafting' && c.sources && c.sources.length)
    .map(c => ({
      type: 'record',
      caseId: c.id,
      leaver: { name: c.leaver.name, role: c.leaver.role },
      interviewDate: longDate(c.interview?.startIso || Date.now()),
      interviewer: cfg.SENDER_NAME,
      rules: ai.RECORD_RULES,
      schemaHint: {
        name: 'string', role: 'string', pronoun: 'he | she | they',
        facts: '[tenure, duration, separation type, interview date] - 4 short strings',
        tenure: 'string', dateMode: 'string', separation: 'string',
        reasonsLead: 'string', reasons: ['string'], strengths: ['string'],
        flags: [{ number: '4.1', title: 'string', body: 'string',
                  quote: "string - the leaver's own sentence on this point, verbatim from the source, or empty",
                  restricted: 'boolean' }],
        named: [{ person: 'string', register: 'adverse | neutral | positive', what: 'string', ref: 'string' }],
        requests: ['string'],
        gaps: ['string - what the record could not establish'],
      },
      sources: c.sources.map(s => ({ label: s.label, from: s.from, date: s.date, body: s.body })),
    }));

  return [...triage, ...records];
}

async function applyAgentResult({ type, caseId, record, details }) {
  if (!caseId) throw new Error('caseId is required');
  const c = store.get(caseId);
  if (!c) throw new Error('No such case');

  // Triage: the routine has read the thread and worked out who is leaving.
  if (type === 'triage' || details) {
    const d = details || {};
    if (d.isExitInterviewRequest === false) {
      store.update(caseId, { stage: 'done', needsTriage: false, notARequest: true });
      store.log(caseId, 'Routine judged this not to be an exit interview request');
      return store.get(caseId);
    }
    const out = store.update(caseId, {
      needsTriage: false,
      leaver: {
        name: d.leaverName || c.leaver.name,
        email: d.leaverEmail || c.leaver.email,
        role: d.role || c.leaver.role,
      },
      lastWorkingDay: d.lastWorkingDay || c.lastWorkingDay,
      suggestedDate: d.suggestedDate || c.suggestedDate,
      notes: d.notes || c.notes,
    });
    store.log(caseId, `Details filled in by the routine: ${out.leaver.name || '(no name found)'}`);
    return out;
  }

  if (!record) throw new Error('record is required');
  if (c.stage !== 'drafting') throw new Error(`Case is ${c.stage}, not waiting for a draft`);

  for (const f of ['name', 'facts', 'flags', 'named', 'requests']) {
    if (record[f] == null) throw new Error('record is missing ' + f);
  }
  const out = await applyRecord(caseId, record);
  store.log(caseId, 'Draft written by the Claude Code routine');
  return out;
}

const STAGE_LABEL = {
  new: 'Needs scheduling',
  scheduled: 'Waiting for the interview',
  drafting: 'Drafting',
  review: 'Ready for your review',
  done: 'Sent',
  error: 'Needs attention',
};

function summary() {
  return store.all().map(c => ({
    id: c.id, stage: c.stage, label: STAGE_LABEL[c.stage] || c.stage,
    name: c.leaver.name, role: c.leaver.role, email: c.leaver.email,
    lastWorkingDay: c.lastWorkingDay, suggestedDate: c.suggestedDate,
    requestedBy: c.request?.from, subject: c.request?.subject,
    interview: c.interview || null,
    restricted: c.restrictedSections || [],
    needsTriage: !!c.needsTriage,
    gaps: c.record?.gaps || [],
    drive: c.drive || null,
    recordTo: recipientFor(c),
    // Everyone the reply would copy, worked out from the thread as it stood when the case
    // opened. The card shows this so the list is read before the send, not discovered
    // after it; publish recomputes it from the live thread at the moment it sends.
    recordCc: ccPreview(c),
    recordDropped: threadAudience(c, c.requestThread || []).dropped.broadcast,
    notetakers: cfg.NOTETAKER_INVITE,
    dismissed: !!c.dismissed,
    handledOutside: !!c.handledOutside,
    updatedAt: c.updatedAt,
  }));
}

module.exports = {
  scanRequests, scanNotes, sendInvite, draft, applyRecord, publish, dismiss, reopen, recipientFor, pollAll, summary,
  agentTasks, applyAgentResult, STAGE_LABEL, looksLikeResignation, editRecord, register, markFiled,
  healthSummary, alertPinAttack, discard, backfill,
};
