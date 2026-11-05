// Runs the real app locally against a made-up set of cases, so the film can show the
// actual screens without a single real leaver's name in them.
//
// Rule 11 in reverse: do not draw the product from memory, and do not crop the real one
// either. This boots the genuine server, genuine HTML, genuine CSS - only the data is
// invented, and Google is stubbed so nothing reaches a real mailbox or Drive.
const path = require('path');
const fs = require('fs');

const APP = 'C:/Raftar/exit-interview-agent';
const DATA = path.join(__dirname, 'demo-data');
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(path.join(DATA, 'pdf'), { recursive: true });

process.env.DATA_DIR = DATA;
process.env.APP_PIN = '';
process.env.NOTIFY = 'false';
process.env.PORT = '8750';

// Stub Google before the app loads it: no polling, no mail, and a register that returns
// invented records.
const g = require(APP + '/src/google.js');
g.search = async () => [];
g.thread = async () => [];
g.profile = async () => 'tahir.saleem@niete.edu.pk';
g.checkDrive = async () => ({ ok: true, name: 'Exit Interviews' });
g.listFolder = async () => ([
  { id: 'f1', name: 'Exit_Interview_Record_Adeel_Raza_2026-10-18.pdf', size: '186000',
    createdTime: '2026-10-18T10:00:00Z', webViewLink: 'https://drive.google.com/file/d/f1/view' },
  { id: 'f2', name: 'Exit_Interview_Record_Mehwish_Tariq_2026-09-30.pdf', size: '171000',
    createdTime: '2026-09-30T10:00:00Z', webViewLink: 'https://drive.google.com/file/d/f2/view' },
  { id: 'f3', name: 'Exit_Interview_Record_Saad_Iqbal_2026-09-12.pdf', size: '164000',
    createdTime: '2026-09-12T10:00:00Z', webViewLink: 'https://drive.google.com/file/d/f3/view' },
  { id: 'f4', name: 'Exit_Interview_Record_Rabia_Noor_2026-08-21.pdf', size: '158000',
    createdTime: '2026-08-21T10:00:00Z', webViewLink: 'https://drive.google.com/file/d/f4/view' },
]);

const store = require(APP + '/src/store.js');
store.ensure();

const RECORD = {
  name: 'Adeel Raza', role: 'Coach, NIETE', pronoun: 'he',
  facts: ['2 years 1 month', '46 minutes', 'Voluntary resignation', '18 October 2026'],
  tenure: 'Approximately 2 years and 1 month',
  dateMode: '18 October 2026 - recorded video call (46 minutes)',
  separation: 'Voluntary resignation',
  reasonsLead: 'He gave his reasons in the order below.',
  reasons: ['<strong>A post closer to home.</strong> The travel had become the hardest part of the week.',
            '<strong>Workload in the last two quarters.</strong> He said it had been raised before.'],
  strengths: ['The coaching team, which he described as the reason he stayed as long as he did.',
              'The freedom to run his own district.'],
  flags: [
    { number: '4.1', title: 'Travel load in the southern districts',
      body: 'He reported four field days a week with no adjustment to the reporting deadlines.',
      quote: 'Haftay mein chaar din field mein, aur report phir bhi raat ko.', restricted: false },
    { number: '4.2', title: 'A promotion he was not told about',
      body: 'He learned of an internal vacancy after it had closed.', quote: '', restricted: false },
  ],
  named: [{ person: 'Area Lead (not named)', register: 'neutral', what: 'He raised the travel load with them twice.', ref: '4.1' }],
  requests: ['A written reason when an internal application is not shortlisted.'],
  gaps: [],
};

const now = Date.now();
const iso = d => new Date(now + d).toISOString();

store.save({
  id: 'demo-new', stage: 'new',
  leaver: { name: 'Mehwish Tariq', email: 'mehwish.tariq@niete.edu.pk', role: 'Regional Manager' },
  lastWorkingDay: '30 November',
  request: { threadId: 't1', rfc822: '<a@b>', from: 'Hina Khalid <hina.khalid@taleemabad.com>',
             subject: 'Re: Resignation — Regional Manager', date: new Date().toUTCString() },
  requestThread: [{ from: 'Hina Khalid <hina.khalid@taleemabad.com>',
                    to: 'tahir.saleem@niete.edu.pk', cc: 'hr@taleemabad.com', subject: 'Re: Resignation' }],
  createdAt: iso(0),
});

store.save({
  id: 'demo-review', stage: 'review',
  leaver: { name: 'Adeel Raza', email: 'adeel.raza@niete.edu.pk', role: 'Coach, NIETE' },
  interview: { startIso: iso(-3 * 86400000) },
  record: RECORD,
  restrictedSections: [],
  filename: 'Exit_Interview_Record_Adeel_Raza_2026-10-18.pdf',
  request: { threadId: 't2', rfc822: '<c@d>', from: 'Hina Khalid <hina.khalid@taleemabad.com>',
             subject: 'Re: Resignation — Coach', date: new Date().toUTCString() },
  requestThread: [{ from: 'Adeel Raza <adeel.raza@niete.edu.pk>', to: 'hina.khalid@taleemabad.com', cc: '' },
                  { from: 'Hina Khalid <hina.khalid@taleemabad.com>',
                    to: 'tahir.saleem@niete.edu.pk', cc: 'hr@taleemabad.com, kamran.shah@taleemabad.com' }],
  createdAt: iso(-1),
});

store.save({
  id: 'demo-done', stage: 'done', dismissed: false,
  leaver: { name: 'Saad Iqbal', email: 'saad.iqbal@niete.edu.pk', role: 'Program Officer' },
  interview: { startIso: iso(-20 * 86400000) },
  drive: { id: 'f3', link: 'https://drive.google.com/file/d/f3/view' },
  sentTo: 'hina.khalid@taleemabad.com',
  request: { threadId: 't3', from: 'Hina Khalid <hina.khalid@taleemabad.com>', subject: 'Re: Resignation' },
  createdAt: iso(-2),
});

// A stand-in PDF so "Read the draft" is a live link in the shot.
fs.writeFileSync(store.pdfPath('demo-review'), Buffer.from('%PDF-1.4\n% demo\n'));

// server.js only binds a port when it is the thing being run, so required here it is just
// the app and this file does the listening.
const app = require(APP + '/src/server.js');
app.listen(8750, () =>
  console.log('demo app on http://127.0.0.1:8750  (invented cases, Google stubbed)'));
