// Shared setup for the tests. Every test gets its own DATA_DIR so they cannot see one
// another's cases, and Chromium and Google are stubbed - what is under test here is the
// decision-making, not whether a browser starts or a network call succeeds.
const fs = require('fs');
const os = require('os');
const path = require('path');

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eia-test-'));
  process.env.DATA_DIR = dir;
  process.env.NOTIFY = 'false';
  fs.mkdirSync(path.join(dir, 'pdf'), { recursive: true });
  return dir;
}

// Must run before engine.js is first required, since it reads config at load.
function stubRender() {
  const render = require('../src/render');
  render.toPdf = async () => Buffer.from('%PDF-stub');
  return render;
}

// Returns the calls the engine made, so a test can assert on what would have been sent.
function stubGoogle(thread = []) {
  const g = require('../src/google');
  const calls = { uploads: 0, shared: [], sent: null, threadReads: 0 };
  g.thread = async () => { calls.threadReads++; return thread; };
  g.uploadFile = async () => { calls.uploads++; return { id: 'drive-file', webViewLink: 'https://drive/x' }; };
  g.shareWithReader = async (_id, who) => { calls.shared.push(who); return 'group'; };
  g.send = async (m) => { calls.sent = m; return { id: 'msg-1' }; };
  g.listFolder = async () => [];
  return calls;
}

const RECORD = {
  name: 'Test Leaver', role: 'Coach, NIETE', pronoun: 'she',
  facts: ['2 years', '48 minutes', 'Resignation', '1 October 2026'],
  tenure: 'Approximately 2 years',
  dateMode: '1 October 2026 - video call (48 minutes)',
  separation: 'Voluntary resignation',
  reasonsLead: 'She gave two reasons, in this order.',
  reasons: ['A role closer to home.', 'Workload over the last two quarters.'],
  strengths: ['The coaching team.'],
  flags: [
    { number: '4.1', title: 'Workload', body: 'She described the quarters as unsustainable.',
      quote: 'Main raat ko 11 baje tak reports bana rahi hoti thi.', restricted: false },
    { number: '4.2', title: 'A named concern', body: 'She named a colleague.', quote: '', restricted: true },
  ],
  named: [{ person: 'Bilal', register: 'adverse', what: 'She raised the workload with him.', ref: '4.1' }],
  requests: ['A clearer handover checklist.'],
  gaps: [],
};

const CASE = {
  id: 'case-1', stage: 'review',
  leaver: { name: 'Test Leaver', email: 'test.leaver@niete.edu.pk', role: 'Coach, NIETE' },
  interview: { startIso: '2026-10-01T05:00:00.000Z' },
  filename: 'Exit_Interview_Record_Test_Leaver_2026-10-01.pdf',
  request: {
    threadId: 'thread-1', rfc822: '<orig@mail>', subject: 'Re: Resignation',
    from: 'Jawwad Ali <jawwad.ali@taleemabad.com>',
  },
};

const clone = o => JSON.parse(JSON.stringify(o));

module.exports = { sandbox, stubRender, stubGoogle, RECORD, CASE, clone };
