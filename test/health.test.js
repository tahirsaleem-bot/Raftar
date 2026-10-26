// Saying so when it has stopped working. A silently broken agent is indistinguishable
// from a quiet month, which is the failure mode this app is least able to afford.
const { test } = require('node:test');
const assert = require('node:assert');
const { sandbox, stubRender, stubGoogle } = require('./helpers');

sandbox();
process.env.NOTIFY = 'true';   // the thing under test
stubRender();
const calls = stubGoogle();

const engine = require('../src/engine');
const g = require('../src/google');

const mails = [];
g.send = async (m) => { mails.push(m); return { id: 'm' }; };

// scanRequests is what actually reaches Gmail, so breaking the search breaks the poll.
let broken = true;
g.search = async () => { if (broken) throw new Error('invalid_grant: token has been expired or revoked'); return []; };

test('one failed poll stays quiet', async () => {
  await assert.rejects(() => engine.pollAll());
  assert.equal(mails.length, 0, 'a single timeout is not worth an email');
  assert.equal(engine.healthSummary().failingSince, '1 consecutive failures');
});

test('a third consecutive failure raises the alarm, once', async () => {
  await assert.rejects(() => engine.pollAll());
  await assert.rejects(() => engine.pollAll());
  assert.equal(mails.length, 1, 'alerted');
  assert.match(mails[0].subject, /stopped working/i);
  assert.match(mails[0].html, /invalid_grant/, 'and says what actually went wrong');

  await assert.rejects(() => engine.pollAll());
  await assert.rejects(() => engine.pollAll());
  assert.equal(mails.length, 1, 'but not again every fifteen minutes');
  assert.ok(engine.healthSummary().alerted);
});

test('recovery sends the all-clear and resets', async () => {
  broken = false;
  const out = await engine.pollAll();
  assert.ok(out.requests, 'the poll ran');
  assert.equal(mails.length, 2);
  assert.match(mails[1].subject, /working again/i);
  assert.equal(engine.healthSummary().failingSince, null);
  assert.equal(engine.healthSummary().alerted, false);
  assert.ok(engine.healthSummary().lastOk, 'and records when it last succeeded');
});

test('a healthy poll after recovery is silent', async () => {
  await engine.pollAll();
  assert.equal(mails.length, 2, 'no mail for working normally');
});

test('a health mail that cannot be sent never breaks the poll', async () => {
  broken = true;
  g.send = async () => { throw new Error('Gmail is down too'); };
  await assert.rejects(() => engine.pollAll(), /invalid_grant/,
    'the poll still reports its own error, not the mail failure');
  await assert.rejects(() => engine.pollAll());
  await assert.rejects(() => engine.pollAll());  // would alert, but sending fails
  assert.ok(true, 'and nothing threw out of reportHealth');
});
