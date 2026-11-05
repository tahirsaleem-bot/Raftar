// One-off: create the "Shared Office Spaces" reminder draft in tahir.saleem's Gmail.
// Uses the LOCAL OAuth token (google-token.json), NOT the MCP connector.
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, '..', 'credentials', 'google-token.json');
const HTML_PATH = 'C:/Users/tahir/AppData/Local/Temp/claude/c--Raftar/4b8093c0-e5df-4338-bf13-f8c2d974a746/scratchpad/office-reminder-email.html';

function getAuth() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const { client_id, client_secret } = credentials.installed || credentials.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  auth.setCredentials(token);
  return auth;
}

const TO = 'coaches@niete.edu.pk';
const CC = [
  'bilal@niete.edu.pk',
  'ahsan.javed@taleemabad.com',
  'zeshan.dhillon@taleemabad.com',
  'javariya.mufarrakh@taleemabad.com',
].join(', ');
const SUBJECT = 'Reminder: Appropriate Use of Shared Office Spaces';

const PLAIN = `Dear Team,

I hope this message finds you well. This is a gentle reminder regarding the appropriate use of our shared office spaces during working hours.

As we regularly host visitors, clients, and guests, it is important that our workplace consistently reflects a professional, organized, and disciplined environment. Kindly note the following guidelines:

- Office Sofas & Common Areas: Intended for work-related discussions, brief meetings, and collaborative conversations - not for resting or lying down during working hours.

- Studio (Prayer Area): Designated primarily as the office prayer area. It may be used for work meetings when required, but not as a general sitting or hangout space, so colleagues can offer prayers whenever needed.

- Energy & Resource Management: Avoiding unnecessary occupancy of the Studio lets us switch off ACs and electrical equipment when not in use - helping us reduce electricity consumption and manage office resources responsibly.

We kindly request everyone to work from their designated workstations during office hours and to use shared spaces only for their intended purpose.

Please note that this is a general reminder and is not directed toward any specific individual. Your cooperation and understanding are greatly appreciated.

Best regards,
RAFTAR
Tahir Agent`;

function buildRaw(html) {
  const boundary = 'raftar_boundary_0007';
  const lines = [
    `To: ${TO}`,
    `Cc: ${CC}`,
    `Subject: ${SUBJECT}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    PLAIN,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    '',
    `--${boundary}--`,
    '',
  ];
  return Buffer.from(lines.join('\r\n'), 'utf-8').toString('base64url');
}

(async () => {
  const auth = getAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  // 1) Verify which account this token belongs to
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const account = profile.data.emailAddress;
  console.log('ACCOUNT:', account);

  if (!/tahir\.saleem/i.test(account)) {
    console.log('ABORT: token is not tahir.saleem. No draft created.');
    process.exit(2);
  }

  // 2) Send the email directly (gmail.send scope)
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  const raw = buildRaw(html);
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
  console.log('SENT_MESSAGE_ID:', res.data.id);
  console.log('DONE — sent from account:', account);
})().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
