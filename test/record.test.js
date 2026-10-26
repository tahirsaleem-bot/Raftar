// Editing a draft from the phone, and what the rendered record contains.
const { test } = require('node:test');
const assert = require('node:assert');
const { sandbox, stubRender, stubGoogle, RECORD, CASE, clone } = require('./helpers');

sandbox();
stubRender();
stubGoogle();
const engine = require('../src/engine');
const store = require('../src/store');
const render = require('../src/render');

const seed = async (id, extra = {}) => {
  store.save({ ...clone(CASE), id, stage: 'drafting', ...extra });
  return engine.applyRecord(id, clone(RECORD));
};

test('edits text, trims it, and drops blank list lines', async () => {
  await seed('e1');
  const out = await engine.editRecord('e1', {
    tenure: '   Three years   ',
    reasons: 'A role closer to home.\n\n   \nWorkload, and the hours it needed.\n',
  });
  assert.equal(out.record.tenure, 'Three years');
  assert.deepEqual(out.record.reasons, ['A role closer to home.', 'Workload, and the hours it needed.']);
  assert.deepEqual(out.record.strengths, RECORD.strengths, 'fields not sent are left alone');
});

test('the structure of the document cannot be changed by an edit', async () => {
  await seed('e2');
  const out = await engine.editRecord('e2', {
    flags: [{ title: 'Renamed' }, {}, { title: 'Injected', body: 'new section' }],
    named: [{ register: 'neutral', person: 'Someone Else' }],
  });
  assert.equal(out.record.flags.length, 2, 'no section can be added');
  assert.equal(out.record.flags[0].number, '4.1', 'numbers are not editable');
  assert.equal(out.record.flags[0].title, 'Renamed');
  assert.equal(out.record.named[0].person, 'Bilal', 'a named person cannot be swapped out');
  assert.equal(out.record.named[0].register, 'neutral', 'but how they were spoken of can be corrected');
});

test('restricted can be set and cleared, and the case list follows', async () => {
  const first = await seed('e3');
  assert.deepEqual(first.restrictedSections, ['4.2']);
  const out = await engine.editRecord('e3', { flags: [{}, { restricted: false }] });
  assert.deepEqual(out.restrictedSections, []);
});

test('a draft with no name on it is refused', async () => {
  await seed('e4');
  await assert.rejects(() => engine.editRecord('e4', { name: '   ' }), /name/i);
});

test('a case with no draft yet cannot be edited', async () => {
  store.save({ ...clone(CASE), id: 'e5', stage: 'new', record: undefined });
  await assert.rejects(() => engine.editRecord('e5', { name: 'x' }), /no draft/i);
});

// Re-rendering returns a case to 'review'. Without this guard, editing something already
// filed and mailed would quietly offer it for sending a second time.
test('a record that has been sent cannot be edited', async () => {
  await seed('e6');
  store.update('e6', { stage: 'done', drive: { link: 'https://drive/x' } });
  await assert.rejects(() => engine.editRecord('e6', { name: 'Changed' }), /already been filed/i);
  assert.equal(store.get('e6').stage, 'done', 'and the case is left where it was');
});

test('a dismissed case is still editable', async () => {
  await seed('e7');
  store.update('e7', { stage: 'done', dismissed: true });
  const out = await engine.editRecord('e7', { name: 'Reopened Name' });
  assert.equal(out.record.name, 'Reopened Name');
});

test("the leaver's own words are rendered, and an absent quote renders nothing", () => {
  const html = render.buildHtml(clone(RECORD), { interviewer: 'Tahir Saleem', dateLong: '1 October 2026' });
  const quotes = html.match(/<p class="q">/g) || [];
  assert.equal(quotes.length, 1, 'only the section that has one');
  assert.ok(html.includes('Main raat ko 11 baje tak reports bana rahi hoti thi.'),
    'kept verbatim - not tidied, not translated');
  assert.match(html, /Section 4\.2 should be/, 'the restricted note is printed');
  assert.ok(!html.includes('{{'), 'no placeholder left unfilled');
});
