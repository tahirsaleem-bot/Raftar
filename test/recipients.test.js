// Who the finished record goes to. The rule Tahir set: reply on the same thread, attach
// the PDF, keep everyone who was already on it - and never the person who resigned.
//
// The tests that matter most here are the negative ones. Sending a confidential record to
// its own subject, or to a company-wide list, is the one mistake in this system that
// cannot be taken back.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { sandbox, stubRender, stubGoogle, RECORD, CASE, clone } = require('./helpers');

sandbox();
stubRender();

const THREAD = [
  { from: 'Test Leaver <test.leaver@niete.edu.pk>', to: 'jawwad.ali@taleemabad.com', cc: '' },
  { from: 'Jawwad Ali <jawwad.ali@taleemabad.com>', to: 'tahir.saleem@niete.edu.pk',
    cc: 'hr@taleemabad.com, javeria.muzaffar@taleemabad.com' },
  { from: 'Tahir Saleem <tahir.saleem@niete.edu.pk>', to: 'rumi@hellorumi.ai', cc: '' },
  { from: 'Zeshan Ali <zeshan.ali@taleemabad.com>', to: 'jawwad.ali@taleemabad.com', cc: '' },
];

const calls = stubGoogle(THREAD);
const engine = require('../src/engine');
const store = require('../src/store');

function freshCase(id, extra = {}) {
  const c = { ...clone(CASE), id, record: clone(RECORD), restrictedSections: ['4.2'], ...extra };
  store.save(c);
  fs.writeFileSync(store.pdfPath(id), Buffer.from('%PDF-stub'));
  return c;
}

test('replies to the requester and copies the rest of the thread', async () => {
  freshCase('r1');
  await engine.publish('r1');
  const { to, cc } = calls.sent;

  assert.equal(to, 'jawwad.ali@taleemabad.com', 'reply goes to whoever asked');
  assert.match(cc, /hr@taleemabad\.com/, 'People & Culture are always copied');
  assert.match(cc, /javeria\.muzaffar@taleemabad\.com/, 'someone who was only ever on Cc');
  assert.match(cc, /zeshan\.ali@taleemabad\.com/, 'someone who joined the thread later');

  assert.doesNotMatch(cc, /test\.leaver/, 'NEVER the leaver');
  assert.doesNotMatch(cc, /tahir\.saleem/, 'not ourselves');
  assert.doesNotMatch(cc, /rumi@hellorumi\.ai/, 'not the notetaker');
});

test('stays on the original thread, with the PDF attached', async () => {
  freshCase('r2');
  await engine.publish('r2');
  assert.equal(calls.sent.threadId, 'thread-1');
  assert.equal(calls.sent.inReplyTo, '<orig@mail>');
  assert.equal(calls.sent.attachments.length, 1);
  assert.equal(calls.sent.attachments[0].mime, 'application/pdf');
  assert.match(calls.sent.subject, /Test Leaver/, 'the subject says whose interview it is');
  assert.match(calls.sent.html, /Test Leaver/);
  assert.match(calls.sent.html, /4\.2/, 'the restricted section is called out in the email');
});

test('everyone on the reply gets read access to the Drive copy', async () => {
  const before = calls.shared.length;
  freshCase('r3');
  await engine.publish('r3');
  const shared = calls.shared.slice(before);
  assert.ok(shared.includes('jawwad.ali@taleemabad.com'));
  assert.ok(shared.includes('hr@taleemabad.com'));
  assert.ok(!shared.some(a => a.includes('test.leaver')), 'never the leaver');
});

test('re-reads the thread at send time rather than trusting the stored copy', async () => {
  const before = calls.threadReads;
  freshCase('r4');
  await engine.publish('r4');
  assert.ok(calls.threadReads > before, 'people get added to these threads in between');
});

test('a company-wide list is left off and named in the log', async () => {
  const wide = [{ from: 'Test Leaver <test.leaver@niete.edu.pk>',
    to: 'all@taleemabad.com, everyone@niete.edu.pk, jawwad.ali@taleemabad.com',
    cc: 'staff-pk@niete.edu.pk' }];
  const g = require('../src/google');
  const normal = g.thread;
  g.thread = async () => wide;
  try {
    freshCase('r5');
    await engine.publish('r5');
    const cc = calls.sent.cc || '';
    const everyone = calls.sent.to + ', ' + cc;
    assert.doesNotMatch(everyone, /all@taleemabad\.com/);
    assert.doesNotMatch(everyone, /everyone@niete\.edu\.pk/);
    assert.doesNotMatch(everyone, /staff-pk@niete\.edu\.pk/);
    assert.match(everyone, /jawwad\.ali/, 'a real person on the same thread still gets it');
    const log = (store.get('r5').log || []).map(l => l.line).join(' ');
    assert.match(log, /wide list/, 'and it is recorded, so it can be added back deliberately');
  } finally { g.thread = normal; }
});

test("the leaver's second address is caught by name, not just by the one on file", async () => {
  const g = require('../src/google');
  const normal = g.thread;
  g.thread = async () => [{ from: 'Test Leaver <test.leaver@gmail.com>', to: 'hr@taleemabad.com', cc: '' }];
  try {
    freshCase('r6');
    await engine.publish('r6');
    assert.doesNotMatch(calls.sent.cc || '', /test\.leaver@gmail\.com/);
  } finally { g.thread = normal; }
});

test('the leaver forced into the Cc by hand stops everything, before anything is uploaded', async () => {
  freshCase('r7');
  const uploadsBefore = calls.uploads;
  await assert.rejects(
    () => engine.publish('r7', { cc: 'hr@taleemabad.com, test.leaver@niete.edu.pk' }),
    /leaver/i,
  );
  assert.equal(calls.uploads, uploadsBefore, 'a refusal must not leave a copy filed in Drive');
  assert.equal(store.get('r7').stage, 'review', 'and the case stays where it was');
});

test('the leaver in the To line is refused the same way', async () => {
  freshCase('r8');
  await assert.rejects(() => engine.publish('r8', { to: 'test.leaver@niete.edu.pk' }), /leaver/i);
});
