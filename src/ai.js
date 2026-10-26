// Two Claude calls: read the HR request, and turn a notetaker summary into a house-style
// record. Everything the record must and must not contain lives in RECORD_RULES below.
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
  if (r.stop_reason === 'refusal') throw new Error('Claude declined: ' + (r.stop_details?.explanation || 'no reason given'));
  if (!r.parsed_output) throw new Error('Claude returned nothing usable (stop: ' + r.stop_reason + ')');
  return r.parsed_output;
}

// ---------------------------------------------------------------- 1. the HR request

const RequestSchema = z.object({
  isExitInterviewRequest: z.boolean().describe('false if this email is about something else'),
  leaverName: z.string().describe('full name of the person leaving; empty string if not stated'),
  leaverEmail: z.string().describe('their work email if the message gives one, else empty'),
  role: z.string().describe('their designation, e.g. "Coach, NIETE" or "Regional Manager"; empty if not stated'),
  lastWorkingDay: z.string().describe('as written in the email, e.g. "31 October" or "" if absent'),
  suggestedDate: z.string().describe('ISO date yyyy-mm-dd if the email proposes one, else empty'),
  notes: z.string().describe('anything else the scheduler should know, in one or two sentences'),
});

// Takes the whole thread, newest message last. The request itself ("pls set up an exit
// interview") names nobody - the leaver is whoever sent the resignation that started the
// thread, so the thread is the unit of meaning here, not the single triggering message.
async function readRequest(messages) {
  const transcript = messages.map(m =>
    `--- From: ${m.from}\n    To: ${m.to}${m.cc ? '\n    Cc: ' + m.cc : ''}\n    Date: ${m.date}\n`
    + `    Subject: ${m.subject}\n\n${m.body.slice(0, 4000)}`
  ).join('\n\n');

  return parse(
    RequestSchema,
    transcript,
    'You are reading an internal email thread at NIETE / Taleemabad. Decide whether someone in it is '
    + 'asking for an exit interview to be set up, and identify who is leaving.\n\n'
    + 'These threads almost always start with the departing person emailing their own resignation, '
    + 'after which People & Culture replies asking for an exit interview to be arranged. So the person '
    + 'leaving is normally the sender of the first message, and their work email address is in that '
    + 'From header - use it. The reply asking for the interview usually does not name them at all.\n\n'
    + 'Set isExitInterviewRequest to false for a resignation nobody has yet asked you to act on, and '
    + 'for unrelated HR traffic such as job applications, offer letters or contract paperwork.\n\n'
    + 'Extract only what the thread actually states. Never invent an email address, a role or a date; '
    + 'return an empty string where the thread does not say.',
    'low',
  );
}

// ---------------------------------------------------------------- 2. the record

const RECORD_RULES = `
You are writing an exit interview record for NIETE / Taleemabad HR, from an automated
notetaker's summary of the conversation.

THE ONE RULE: the record carries what the person said, and nothing else.

An exit record is evidence, not advocacy. HR, the leaver's manager and leadership each read
it and each must reach their own judgement. The moment you grade how serious a complaint is,
you have made that judgement for them - on one side's account, without having been there.

So:
- Report with neutral verbs: "She said", "He described", "She named", "He reported".
- Never add severity ratings, risk assessments, an overall assessment, "why this matters"
  commentary, or action items you thought of yourself.
- "What they asked for" contains ONLY requests the person actually made. If they did not
  ask for it, it does not go in.
- Never skip what worked, even after a critical interview. Those are the parts of the
  organisation worth protecting, and leaving them out makes the record read as a hit piece,
  which makes the criticism easier to dismiss.
- Keep the order of reasons for leaving as the person gave them. Someone who names a culture
  problem before naming their new job is telling you something.

LENGTH: aim for a record that prints to three or four pages. Get there by cutting commentary
and scaffolding, never by dropping a substantive point.

THE NOTETAKER IS NOT NEUTRAL. Rumi and Fathom editorialise in exactly the way this record
must not ("a masterclass in devastatingly honest feedback", "cultural rot"). Take the facts
and the quotes; drop their framing completely. They also invent follow-up owners and sprinkle
plausible names into them - only record people the departing person actually named.

THEIR WORDS, NOT THE NOTETAKER'S. What you are reading is already a paraphrase: Rumi and
Fathom rewrite the conversation into their own prose, and a record built only on that prose
is a summary of a summary - it loses the one thing that makes an exit record worth keeping,
which is how the person themselves put it.

So mine the source for their actual sentences and carry them across unchanged. Rumi's
summaries contain a "Key Quotes" section of verbatim lines with attribution; that section is
the most valuable thing in the whole email and should be read first. Quoted passages also
appear inline elsewhere in both notetakers' output.

- Keep a quoted sentence EXACTLY as the source has it. Do not tidy the grammar, do not
  smooth an informal phrase into a formal one, do not translate or anglicise an Urdu or
  mixed-language expression. The roughness is the evidence.
- Put their own sentence on the point in that section's "quote" field, and quote their
  phrasing inline in the reasons and strengths wherever the source preserves it.
- Attribute a line to the leaver only where the source attributes it to them. Much of what
  is quoted in these summaries was said by the interviewer, not by the person leaving.
- Where the source gives no verbatim line for a point, leave "quote" empty and report the
  point in neutral reporting voice. NEVER reconstruct what they probably said. An invented
  quotation is the single worst thing this document could contain: it is the part a reader
  trusts most and the part they cannot check.

NAMES: name the people the leaver named; a record that says "a manager" is of little use to
HR. But keep the register honest. Someone the leaver COMPLAINED TO is "neutral", not
"adverse" - collapsing that distinction puts a cloud over somebody who may have done nothing.
Where a role was named but not the person, say exactly that. Where someone disclosed
harassment but named nobody, record that absence explicitly; it is a fact about the testimony.

RESTRICTED SECTIONS: flag any section carrying a harassment disclosure or a named allegation
of dishonesty. Those sections travel badly, and marking the boundary inside the document is
how the boundary survives the document being forwarded.

GAPS ARE CONTENT: if a question was not asked, say so rather than inferring an answer. An
inferred reason that turns out to be wrong discredits everything around it.
`;

const RecordSchema = z.object({
  name: z.string(),
  role: z.string().describe('designation as stated, e.g. "Coach, NIETE"'),
  pronoun: z.enum(['he', 'she', 'they']).describe('pick from the summary; use "they" if unclear'),

  facts: z.array(z.string()).length(4)
    .describe('four headline values in order: tenure, interview duration, separation type, interview date. Two or three words each.'),

  tenure: z.string().describe('e.g. "Approximately 2.5 years", or "Not stated in the interview" '),
  dateMode: z.string().describe('e.g. "7 October 2026 - recorded video call (53 minutes)"'),
  separation: z.string().describe('e.g. "Voluntary resignation"'),

  reasonsLead: z.string().describe('one short framing line; say plainly if the reason-for-leaving question was never put'),
  reasons: z.array(z.string()).describe('bullet text, HTML allowed for <strong>'),

  strengths: z.array(z.string()).describe('what they said worked; bullet text, HTML allowed'),

  flags: z.array(z.object({
    number: z.string().describe('e.g. "4.1"'),
    title: z.string().describe('short title, no trailing full stop'),
    body: z.string().describe('one paragraph of plain reporting; HTML allowed for <strong> and <em>'),
    quote: z.string().describe("the leaver's own sentence on this point, copied verbatim from the source with no tidying, and only where the source attributes it to them. Empty string if the source preserves no words of theirs here - never reconstruct one."),
    restricted: z.boolean().describe('true for harassment disclosures or named allegations of dishonesty'),
  })),

  named: z.array(z.object({
    person: z.string(),
    register: z.enum(['adverse', 'neutral', 'positive']),
    what: z.string().describe('what the leaver said about them, one or two sentences'),
    ref: z.string().describe('the section number this came from'),
  })),

  requests: z.array(z.string()).describe('only requests the leaver themselves made'),

  gaps: z.array(z.string())
    .describe('things the record could not establish - a question never asked, a manager referred to but never named, a name that only reached you through the machine transcript. Shown to the interviewer, not printed in the document.'),
});

async function writeRecord({ leaverName, role, interviewDate, interviewer, sources }) {
  const body = sources.map((s, i) =>
    `--- SOURCE ${i + 1}: ${s.label} (${s.from}, ${s.date}) ---\n${s.body.slice(0, 40000)}`
  ).join('\n\n');

  return parse(
    RecordSchema,
    `Leaver: ${leaverName}\nRole: ${role || '(not stated)'}\nInterview date: ${interviewDate}\n`
    + `Interviewer: ${interviewer}\n\n${body}\n\n`
    + 'Write the record from these sources. Where two sources disagree on a fact, record both '
    + 'and attribute them - the discrepancy is itself something HR needs to see.',
    RECORD_RULES,
    'high',
  );
}

module.exports = { ready, readRequest, writeRecord, RECORD_RULES };
