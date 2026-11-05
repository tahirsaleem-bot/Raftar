// Builds preview HTML files (no sending) for Noor ul Ain Rana's employment verification emails.
const fs = require('fs');
const path = require('path');

const CANDIDATE = 'Noor ul Ain Rana';
const RESPONSE_DATE = 'Monday, 19 October 2026';
const RECIPIENTS = [  { key: 'teach_for_pakistan', org: 'Teach For Pakistan', name: 'Wajeeha Abbasi', email: 'hr@iteachforpakistan.org',    designation: 'Fellow', start: 'July 2023', end: 'June 2025' },];

const template = fs.readFileSync('C:/Raftar/verification/employment_verification_email.html', 'utf8');
for (const r of RECIPIENTS) {
  const html = template
    .replace(/\[Recipient Name\]/g, r.name)
    .replace(/\[Candidate Name\]/g, CANDIDATE)
    .replace(/\[Designation\]/g, r.designation)
    .replace(/\[Start Date\]/g, r.start)
    .replace(/\[End Date\]/g, r.end)
    .replace(/\[Response Date\]/g, RESPONSE_DATE)
    .replace('has listed your organization in their CV', `has listed <strong>${r.org}</strong> in their CV`)
    .replace('has shared your contact details, with their consent, for this purpose', 'has consented to this verification');
  fs.writeFileSync(path.join(__dirname, `preview_${r.key}.html`), html);
  console.log(`preview_${r.key}.html  ->  ${r.email}`);
}
