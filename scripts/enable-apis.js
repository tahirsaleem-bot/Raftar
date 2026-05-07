/**
 * Prints the direct URLs to enable all required Google APIs.
 * Open each link and click "Enable".
 *
 * Usage: node scripts/enable-apis.js
 */

const PROJECT_ID = 'charged-audio-491909-h7';

const APIS = [
  { name: 'Gmail API',            id: 'gmail.googleapis.com' },
  { name: 'Google Calendar API',  id: 'calendar.googleapis.com' },
  { name: 'Google Sheets API',    id: 'sheets.googleapis.com' },
  { name: 'Google Docs API',      id: 'docs.googleapis.com' },
  { name: 'Google Drive API',     id: 'drive.googleapis.com' },
];

const c = {
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
};

console.log('\n' + c.bold('═══════════════════════════════════════════════'));
console.log(c.bold('  Enable Required Google APIs'));
console.log(c.bold('  Project: ' + PROJECT_ID));
console.log(c.bold('═══════════════════════════════════════════════'));
console.log('\nOpen each link below, click ' + c.bold('"Enable"') + ' if not already enabled:\n');

for (const api of APIS) {
  const url = `https://console.cloud.google.com/apis/library/${api.id}?project=${PROJECT_ID}`;
  console.log(c.green('  ► ' + api.name));
  console.log(c.cyan('    ' + url));
  console.log('');
}

console.log(c.bold('After enabling all APIs, run:'));
console.log(c.cyan('  npm run setup\n'));

// Try to open all URLs in browser automatically
const { exec } = require('child_process');
console.log('Opening all API pages in your browser...\n');
for (const api of APIS) {
  const url = `https://console.cloud.google.com/apis/library/${api.id}?project=${PROJECT_ID}`;
  exec(`start "" "${url}"`);
}
