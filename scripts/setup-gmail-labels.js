/**
 * Creates Raftar's Gmail labels, a filter per label (so new mail is labelled
 * automatically) and applies each label to matching existing mail.
 * Nothing is archived, deleted or marked read — labels are only added.
 * Safe to re-run: existing labels/filters are reused, not duplicated.
 *
 * Needs gmail.modify + gmail.settings.basic (run scripts/authorize.js first).
 * Usage: node scripts/setup-gmail-labels.js
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, '..', 'credentials', 'google-token.json');

const LABELS = [
  {
    name: 'HR',
    query: 'from:(hr@taleemabad.com OR hr@iteachforpakistan.org OR hr@niete.edu.pk OR hiring@taleemabad.com) OR subject:(resignation OR "employment verification" OR "exit interview" OR "offer letter")',
  },
  { name: 'Jazz', query: 'from:jazz.com.pk OR subject:jazz' },
  { name: 'Nayatel', query: 'from:nayatel.com.pk OR subject:nayatel' },
  { name: 'Buscaro', query: 'from:buscaro.com OR buscaro OR "dedicated fleet"' },
  {
    name: 'Reimbursement',
    query: 'subject:(reimbursement OR reimburse OR claim) OR from:smartbenefits.pk',
  },
  {
    name: 'Operations',
    query: 'subject:(operations OR logistics OR "admin ops")',
  },
];

async function main() {
  const { client_id, client_secret } = JSON.parse(fs.readFileSync(CREDENTIALS_PATH)).installed;
  const auth = new google.auth.OAuth2(client_id, client_secret);
  auth.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
  const gmail = google.gmail({ version: 'v1', auth });

  const profile = await gmail.users.getProfile({ userId: 'me' });
  console.log(`Account: ${profile.data.emailAddress}\n`);

  const existing = (await gmail.users.labels.list({ userId: 'me' })).data.labels;
  const filters = (await gmail.users.settings.filters.list({ userId: 'me' })).data.filter || [];

  for (const { name, query } of LABELS) {
    let label = existing.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (!label) {
      label = (await gmail.users.labels.create({
        userId: 'me',
        requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
      })).data;
    }

    const hasFilter = filters.some(f => f.criteria?.query === query && f.action?.addLabelIds?.includes(label.id));
    if (!hasFilter) {
      await gmail.users.settings.filters.create({
        userId: 'me',
        requestBody: { criteria: { query }, action: { addLabelIds: [label.id] } },
      });
    }

    // Label existing mail (batchModify takes max 1000 ids per call)
    let pageToken, count = 0;
    do {
      const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 500, pageToken });
      const ids = (res.data.messages || []).map(m => m.id);
      if (ids.length) {
        await gmail.users.messages.batchModify({ userId: 'me', requestBody: { ids, addLabelIds: [label.id] } });
        count += ids.length;
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    console.log(`${name.padEnd(14)} label ✓  filter ✓  ${count} emails labelled`);
  }
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
