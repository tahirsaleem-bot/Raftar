// Builds preview HTML files (no sending) for Zia ul Hasnain's employment verification emails.
const fs = require('fs');
const path = require('path');

const CANDIDATE = 'Zia ul Hasnain';
const RESPONSE_DATE = 'Monday, 19 October 2026';
const RECIPIENTS = [
  { key: 'cities_for_children', org: 'Cities for Children', name: 'Madeeha Ansari', email: 'madeeha@citiesforchildren.co',
    designation: 'Communications & Research Intern', start: 'July 2025', end: 'August 2025' },
  { key: 'mehd', org: 'Maan Education and Health Development Organization (MEHD)', name: 'Malik Muhammad Faisal', email: 'faisalmalik@mehdfoundation.org',
    designation: 'Media and Communications Officer', start: 'August 2023', end: 'December 2023' },
  { key: 'suno_news', org: 'SUNO News', name: 'Muhammad Kamran Khan', email: 'kamran.khan@sunotv.com',
    designation: 'News Reporter (Election Cell)', start: 'January 2024', end: 'June 2024' },
  { key: 'zab_fm', org: 'ZAB FM 106.6', name: 'Dr. Wajid Zulqarnain', email: 'hod.media@szabist-isb.edu.pk',
    designation: 'Radio Host (RJ)', start: 'June 2022', end: 'August 2022' },
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
