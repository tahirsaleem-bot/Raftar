// Builds the preview (no sending) for Hina Fatima Jafri's employment verification email.
const fs = require('fs');
const path = require('path');

const CANDIDATE = 'Hina Fatima Jafri';
const RESPONSE_DATE = 'Tuesday, 20 October 2026';
const RECIPIENTS = [
  { key: 'radiant', org: 'Radiant Secondary School', name: 'Ch. Mukhtar Ahmed Warraich', email: 'radsscl@gmail.com',
    designation: 'Teacher', start: '2012', end: '2018' },
];

const template = fs.readFileSync('C:/Raftar/verification/employment_verification_email.html', 'utf8');
for (const r of RECIPIENTS) {
  const html = template
    .replace(/\[Recipient Name\]/g, r.name)
    .replace(/\[Candidate Name\]/g, CANDIDATE)
    .replace(/\[Designation\]/g, r.designation)
    .replace(/\[Start Date\]/g, r.start)
    .replace(/\[End Date\]/g, r.end)
    .replace(/\[Response Date\]/g, RESPONSE_DATE)
    .replace('has listed your organization in their CV', `has listed <strong>${r.org}</strong> in their CV`);
  fs.writeFileSync(path.join(__dirname, `preview_${r.key}.html`), html);
  console.log(`preview_${r.key}.html  ->  ${r.email}`);
}
