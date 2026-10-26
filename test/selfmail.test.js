// The app watches the same mailbox it writes to. Its nudges say things like "Exit
// interview to schedule", so without a guard it reads its own post, opens a case, nudges
// about that case, and opens another - which is what happened in production on
// 2026-10-26: four junk cases, and a PIN alert that opened a fifth.
const { test } = require('node:test');
const assert = require('node:assert');
const { sandbox, stubRender, stubGoogle, CASE, RECORD, clone } = require('./helpers');

sandbox();
stubRender();
stubGoogle();
const engine = require('../src/engine');
const store = require('../src/store');

// The header is the real fix: it is on everything the app sends, including message types
// added later, so nothing has to remember to add a subject to a list.
test('a message carrying the agent header is never a request', () => {
  assert.ok(!engine.looksLikeResignation({
    subject: 'Exit interview to schedule - new resignation',
    body: 'Someone has resigned. The case is open and waiting for a time.',
    fromAgent: true,
  }));
});

test('the header wins even over wording that would otherwise qualify', () => {
  assert.ok(!engine.looksLikeResignation({
    subject: 'Anything at all',
    body: 'I am writing to submit my resignation.',
    fromAgent: true,
  }));
});

// Belt and braces for the ones already in the mailbox from before the header existed.
for (const subject of [
  'Exit interview to schedule - new resignation',
  'Exit interview record ready - Sara Fatima',
  'Exit Interview Record - Waqas Panezai',
  'Exit interview agent has stopped working',
  'Exit interview agent is working again',
  'Someone is guessing the exit interview PIN',
  'Re: Exit interview to schedule - new resignation',
  'Fwd: Someone is guessing the exit interview PIN',
]) {
  test(`our own subject is ignored without the header: ${subject}`, () => {
    assert.ok(!engine.looksLikeResignation({ subject, body: 'My resignation. I hereby resign.' }));
  });
}

test('a real resignation is still caught', () => {
  assert.ok(engine.looksLikeResignation({
    subject: 'Resignation Email', body: 'Please accept my resignation.', fromAgent: false,
  }));
});

test('and so is one that merely mentions an exit interview being arranged', () => {
  assert.ok(engine.looksLikeResignation({
    subject: 'Fwd: Please take over',
    body: '@Tahir kindly arrange an exit interview for him this week.',
  }));
});

// Clearing up after it. Dismiss leaves a case in the list, which is right for a real
// resignation and wrong for noise.
test('a case with no record can be removed outright', () => {
  store.save({ ...clone(CASE), id: 'd1', stage: 'new', record: undefined });
  const out = engine.discard('d1');
  assert.equal(out.removed, true);
  assert.equal(store.get('d1'), null, 'gone from the store, not just hidden');
});

test('a case that has a record cannot be thrown away here', () => {
  store.save({ ...clone(CASE), id: 'd2', stage: 'review', record: clone(RECORD) });
  assert.throws(() => engine.discard('d2'), /cannot be thrown away/i);
  assert.ok(store.get('d2'), 'still there');
});

test('nor can one that has been filed in Drive', () => {
  store.save({ ...clone(CASE), id: 'd3', stage: 'done', record: undefined, drive: { link: 'https://drive/x' } });
  assert.throws(() => engine.discard('d3'), /cannot be thrown away/i);
});

test('removing something that is not there says so', () => {
  assert.throws(() => engine.discard('nope'), /No such case/i);
});
