// Claude calls: read the CV, understand the employee's reply, research each organization on the web, classify replies.
const Anthropic = require('@anthropic-ai/sdk');
const { z } = require('zod');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const cfg = require('./config');

const ready = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
let client = null;
const claude = () => (client ||= new Anthropic());

async function parse(schema, content, system, effort = 'medium') {
  const r = await claude().messages.parse({
    model: cfg.MODEL, max_tokens: 16000, system,
    output_config: { format: zodOutputFormat(schema), effort },
    messages: [{ role: 'user', content }],
  });
  if (r.stop_reason === 'refusal') throw new Error('Claude declined this request: ' + (r.stop_details?.explanation || 'no reason given'));
  if (!r.parsed_output) throw new Error('Claude returned no usable result (stop: ' + r.stop_reason + ')');
  return r.parsed_output;
}

function fileBlock(mime, b64) {
  if (mime === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } };
  if (/^image\/(png|jpeg|gif|webp)$/.test(mime)) return { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } };
  return null;
}

// ---------- 1. CV ----------
const CvSchema = z.object({
  candidate_name: z.string(),
  date_of_birth: z.string().nullable(),
  experience: z.array(z.object({
    organization: z.string(),
    designation: z.string(),
    start: z.string().nullable(),
    end: z.string().nullable(),
    location: z.string().nullable(),
    kind: z.enum(['job', 'internship', 'fellowship', 'volunteer', 'other']),
  })),
  cv_references: z.array(z.object({
    name: z.string(), title: z.string().nullable(), organization: z.string().nullable(),
    email: z.string().nullable(), phone: z.string().nullable(),
  })),
  consistency_notes: z.array(z.string()),
});

async function extractCv(mime, buf) {
  const block = fileBlock(mime, buf.toString('base64'));
  if (!block) throw new Error(`CV format "${mime}" is not supported — upload it as PDF or an image`);
  return parse(CvSchema, [block, { type: 'text', text:
    'This is a job candidate\'s CV. Extract every work-experience entry (jobs, fellowships, internships, volunteer roles) exactly as the CV states it: ' +
    'keep the CV\'s own wording for organization and designation, give dates as written (e.g. "July 2024"), and use null when the CV gives none. Skip education. ' +
    'List any personal references the CV names. In consistency_notes, list short factual points a verifier should know — e.g. jobs without dates, overlapping roles, ' +
    'a date of birth that does not fit the education years, titles that look inflated for the setting. State facts only; do not speculate about honesty.' }],
  'You extract structured data from CVs for an HR team in Pakistan. Be literal and complete.', 'medium');
}

// ---------- 2. Employee's reply with contacts ----------
const ContactsSchema = z.object({
  organizations: z.array(z.object({
    organization: z.string(),
    cv_index: z.number().int().nullable(),
    designation_per_employee: z.string().nullable(),
    start_per_employee: z.string().nullable(),
    end_per_employee: z.string().nullable(),
    contact_name: z.string().nullable(),
    contact_title: z.string().nullable(),
    contact_email: z.string().nullable(),
    contact_phone: z.string().nullable(),
    documents: z.array(z.string()),
    notes: z.string().nullable(),
  })),
  cv_entries_without_contact: z.array(z.string()),
  summary: z.string(),
});

async function parseContacts(cv, replies) {
  const content = [{ type: 'text', text:
    `CV work experience (index: entry):\n${cv.experience.map((e, i) => `${i}: ${e.organization} — ${e.designation} (${e.start || '?'} – ${e.end || '?'}) [${e.kind}]`).join('\n')}\n\n` +
    `References named on the CV: ${JSON.stringify(cv.cv_references)}\n\n` +
    `The employee was asked by HR for contact details of people at their previous organizations who can verify their experience. Their replies (oldest first):\n\n` +
    replies.map((r, i) => `--- Reply ${i + 1} (${r.date}) ---\n${r.text}\nAttachments: ${r.attachments.map(a => a.filename + (a.skipped ? ' (not readable here)' : '')).join(', ') || 'none'}`).join('\n\n') +
    '\n\nAny readable attachments follow as images/documents.' }];
  for (const r of replies) for (const a of r.attachments) { const b = a.data && fileBlock(a.mimeType, a.data); if (b) content.push(b); }
  content.push({ type: 'text', text:
    'Produce one entry per organization the CV lists or the employee mentions. Link it to the CV entry by cv_index (null if the CV does not list it). ' +
    'Copy contact details exactly as given — never invent or correct an email or phone. In documents, describe each attached letter/certificate that relates to the organization ' +
    '(issuer, signatory, dates, designation it states). In notes, state any difference between the CV, the employee\'s email and the documents (dates, designation, organization name). ' +
    'List CV entries for which the employee gave no contact in cv_entries_without_contact.' });
  return parse(ContactsSchema, content, 'You help an HR officer verify previous employment. Be precise and factual.', 'medium');
}

// ---------- 3. Web check of one organization ----------
const CheckSchema = z.object({
  org_exists: z.enum(['yes', 'no', 'unclear']),
  what_it_is: z.string(),
  official_website: z.string().nullable(),
  official_email: z.string().nullable(),
  official_phone: z.string().nullable(),
  contact_assessment: z.string(),
  red_flags: z.array(z.string()),
  risk: z.enum(['low', 'medium', 'high']),
  recommended_to_email: z.string().nullable(),
  recommended_to_name: z.string().nullable(),
  recommended_reason: z.string(),
});

async function webResearch(prompt) {
  const messages = [{ role: 'user', content: prompt }];
  let resp;
  const sources = new Set();
  for (let i = 0; i < 4; i++) {
    resp = await claude().messages.create({
      model: cfg.MODEL, max_tokens: 16000, output_config: { effort: 'medium' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'PK', city: 'Islamabad' } }],
      messages,
    });
    for (const b of resp.content) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) b.content.forEach(x => x.url && sources.add(x.url));
    }
    if (resp.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: resp.content });
  }
  if (resp.stop_reason === 'refusal') throw new Error('Claude declined the web check');
  const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  return { text, sources: [...sources].slice(0, 12) };
}

async function checkOrganization(o, cv) {
  const contact = [o.contact_name, o.contact_title, o.contact_email, o.contact_phone].filter(Boolean).join(', ') || 'none given';
  const research = await webResearch(
    `An HR officer at Taleemabad/NIETE (Pakistan) is verifying a candidate's previous employment. Check this organization on the web.\n` +
    `Organization as the candidate wrote it: ${o.organization}\nLocation hint: ${o.location || 'Pakistan, most likely Islamabad/Rawalpindi'}\n` +
    `Contact the candidate gave: ${contact}\n\nFind: (1) whether the organization really exists, where, and what it does; (2) its official website, email domain and phone numbers; ` +
    `(3) whether the given contact's email domain or phone matches the official channels (search the exact phone/email too); (4) an official HR or general email we could send a verification request to. ` +
    `Report briefly, cite the pages you used, and say plainly when you could not find something.`);
  const check = await parse(CheckSchema, [{ type: 'text', text:
    `Organization: ${o.organization}\nCandidate's role there: ${o.designation_cv || '?'} per CV; ${o.designation_per_employee || '?'} per employee's email\n` +
    `Dates: ${o.start || '?'} – ${o.end || '?'} per CV; ${o.start_per_employee || '?'} – ${o.end_per_employee || '?'} per employee\n` +
    `Contact given by the candidate: ${contact}\nDocuments provided: ${(o.documents || []).join(' | ') || 'none'}\nNotes from the reply: ${o.notes || 'none'}\n` +
    `Personal references on the CV: ${JSON.stringify(cv.cv_references)}\n\nWeb research findings:\n${research.text}` }],
  'You assess whether a previous-employment contact can be trusted for verification. Red flags to check: the contact uses a personal webmail address (gmail/hotmail/yahoo/outlook) — ' +
  'common for small Pakistani schools, so medium risk on its own, not high; the contact is also a personal reference on the CV (possible friend); the contact\'s role is unrelated to the ' +
  'candidate\'s job (e.g. a marketing head verifying an HR role); designation or dates differ between CV, email and documents; the organization cannot be found online; the given phone ' +
  'does not match official numbers. Prefer an official HR/general email from the organization over a candidate-supplied contact when one was found. recommended_to_email must be an address ' +
  'that literally appears in the research or the candidate\'s details — never invent one; use null if none is usable. Write findings in plain English, one short sentence each.', 'medium');
  return { ...check, sources: research.sources };
}

// ---------- 4. Reply from an organization ----------
const ReplySchema = z.object({
  verdict: z.enum(['confirmed', 'partially_confirmed', 'not_confirmed', 'needs_more_info', 'auto_reply_or_unrelated']),
  confirmed_designation: z.string().nullable(),
  confirmed_period: z.string().nullable(),
  differences: z.array(z.string()),
  summary: z.string(),
});

async function classifyReply(o, candidate, text) {
  return parse(ReplySchema, [{ type: 'text', text:
    `We asked ${o.organization} to confirm that ${candidate} worked there as "${o.designation}" from ${o.start || '?'} to ${o.end || '?'}.\nTheir reply:\n${text}\n\n` +
    'Classify the reply. "confirmed" only if they confirm the person worked there and nothing they state contradicts the designation or period. List any differences exactly.' }],
  'You read employment verification replies for an HR team. Be literal.', 'low');
}

module.exports = { ready, extractCv, parseContacts, checkOrganization, classifyReply };
