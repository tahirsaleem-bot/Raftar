// What opens a case. Measured against the real mailbox over 200 days before these rules
// were settled: matching the bare word "resignation" anywhere in a body produced 5 junk
// cases out of 7, because offer letters ask for "your resignation from your current
// employer" and leave-policy and handover threads use the word too. Matching a resignation
// SENTENCE instead rejected all twelve look-alike threads and kept all six real ones.
const { test } = require('node:test');
const assert = require('node:assert');
const { sandbox, stubRender } = require('./helpers');

sandbox();
stubRender();
const { looksLikeResignation } = require('../src/engine');

const caught = (name, subject, body) =>
  test(`catches: ${name}`, () => assert.ok(looksLikeResignation({ subject, body }), name));

const rejected = (name, subject, body) =>
  test(`rejects: ${name}`, () => assert.ok(!looksLikeResignation({ subject, body }), name));

caught('a resignation subject', 'Resignation Email', 'Please see attached.');
caught('a body-only resignation', 'Quick note',
  'Dear Sir,\n\nI am writing to formally submit my resignation from my position as a Coach.');
caught('a forward describing a third party', 'Fwd: FYI',
  'Tahir, please handle this.\n\n--- Forwarded message ---\nSana has resigned effective 30 Nov.');
caught('a covering line with no resignation wording', 'Fwd: Please take over',
  '@Tahir kindly arrange an exit interview for him this week.');
caught('"I hereby resign"', 'Notice', 'I hereby resign from the organisation with one month notice.');
caught('a last working day', 'Update', 'My last working day will be 15 December 2026.');
caught('a manager accepting one', 'Re: Team update',
  'We have accepted her resignation; please proceed with offboarding.');
caught('wording buried below a long forward', 'Fwd: see below',
  'x'.repeat(4000) + '\nI am writing to submit my resignation.');

rejected('an offer letter', 'Congratulations Aliya on Your Selection as a Coach',
  'Kindly share your resignation from your current employer before joining.');
rejected('a leave policy', 'Niete Leave Policy',
  'Unused leave is not encashed on resignation or termination of contract.');
rejected('an assets handover thread', 'Assets Handover Confirmation Request',
  'All assets must be returned at the time of resignation.');
rejected('unrelated mail', 'Weekly report', 'Attendance was 92 percent this week across all hubs.');

// Our own finished record leaves the original thread behind, so thread de-duplication
// misses it, and it quotes every term the matcher looks for. Left alone it opened a second
// case for somebody whose interview was already filed.
rejected('our own record email', 'Exit Interview Record - Waqas Panezai',
  'As requested, the exit interview record is attached. My resignation.');
rejected('a reply to our own record', 'Re: Exit Interview Record - Waqas Panezai', 'Thanks.');
rejected('a forward of our own record', 'Fwd: Exit Interview Record - Waqas Panezai', 'FYI');
