// What the app keeps after a record is filed. The raw notetaker summary is the substance
// of the interview - allegations, names, sometimes a harassment disclosure - and once the
// record exists there is nothing using it. Keeping it forever on an app volume is a
// liability that buys nothing.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { sandbox, stubRender, stubGoogle, RECORD, CASE, clone } = require('./helpers');

sandbox();
stubRender();
stubGoogle([{ from: 'Jawwad Ali <jawwad.ali@taleemabad.com>', to: 'tahir.saleem@niete.edu.pk', cc: '' }]);
const engine = require('../src/engine');
const store = require('../src/store');

// No newlines or quotes: these tests search the stored JSON, which escapes both.
const SUMMARY = 'Key Quotes - I was doing reports until 11 at night, Test Leaver said';
const THREAD_BODY = 'I am writing to submit my resignation, effective 31 October.';

function seed(id, extra = {}) {
  store.save({
    ...clone(CASE), id,
    record: clone(RECORD),
    restrictedSections: ['4.2'],
    sources: [{ label: 'Recap', from: 'rumi@hellorumi.ai', date: 'x', body: SUMMARY, messageId: 'm1' }],
    requestThread: [{ from: 'Test Leaver <test.leaver@niete.edu.pk>', to: 'hr@taleemabad.com',
                      cc: '', date: 'x', subject: 'Resignation', body: THREAD_BODY }],
    ...extra,
  });
  fs.writeFileSync(store.pdfPath(id), Buffer.from('%PDF-stub'));
}

test('sending the record clears the raw material behind it', async () => {
  seed('p1');
  const before = JSON.stringify(store.get('p1'));
  assert.ok(before.includes(SUMMARY), 'the summary was there to begin with');
  assert.ok(before.includes(THREAD_BODY));

  await engine.publish('p1');

  const after = JSON.stringify(store.get('p1'));
  assert.ok(!after.includes(SUMMARY), 'the notetaker summary is gone');
  assert.ok(!after.includes(THREAD_BODY), 'and so are the message bodies');
});

test('but everything needed to answer for the record is kept', async () => {
  seed('p2');
  await engine.publish('p2');
  const c = store.get('p2');

  assert.equal(c.record.name, 'Test Leaver', 'the record itself stays - a correction is written from it');
  assert.equal(c.record.flags[0].quote, RECORD.flags[0].quote, "including the leaver's own words");
  assert.ok(c.drive.link, 'where it was filed');
  assert.ok(c.sentTo, 'who it went to');
  assert.ok(c.sentCc.length, 'and who was copied');

  assert.equal(c.sources[0].from, 'rumi@hellorumi.ai', 'which notetaker it came from');
  assert.equal(c.sources[0].purged, true, 'marked, so it is clear this was deliberate');
  assert.equal(c.requestThread[0].subject, 'Resignation', 'thread headers survive');
  assert.ok((c.log || []).some(l => /cleared/.test(l.line)), 'and it is in the case log');
});

test('an interview handled outside the app is purged the same way', async () => {
  seed('p3', { stage: 'done', dismissed: true });
  await engine.markFiled('p3', { interviewDate: '2026-09-21', driveLink: 'https://drive/y' });
  const after = JSON.stringify(store.get('p3'));
  assert.ok(!after.includes(THREAD_BODY));
  assert.equal(store.get('p3').dismissed, false);
  assert.equal(store.get('p3').handledOutside, true);
});

test('purging twice is harmless', async () => {
  seed('p4', { stage: 'done', dismissed: true });
  await engine.markFiled('p4', { driveLink: 'https://drive/z' });
  await engine.markFiled('p4', { driveLink: 'https://drive/z' });
  assert.equal(store.get('p4').sources[0].purged, true);
});

test('a case with nothing raw left is not touched', async () => {
  store.save({ ...clone(CASE), id: 'p5', stage: 'done', dismissed: true, sources: [], requestThread: [] });
  await engine.markFiled('p5', { driveLink: 'https://drive/w' });
  const logs = (store.get('p5').log || []).filter(l => /cleared/.test(l.line));
  assert.equal(logs.length, 0, 'no misleading log line about clearing nothing');
});
