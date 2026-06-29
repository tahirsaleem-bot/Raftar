// Map a user's logbook entries to the 6 Taleemabad People Analyzer values,
// drafting SBI evidence from the REAL entries. Human-sounding English, no fabrication.
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const logger = require('../logger');
const { retry } = require('../utils/retry');

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

const VALUES = [
  { n: 1, name: "Don't walk away from hard things", def: "We lean into difficult problems instead of avoiding them." },
  { n: 2, name: "All for one, one for all", def: "We play as a team and let others shine." },
  { n: 3, name: "Don't hold on too tightly", def: "We stay humble, open-handed; ideas, roles, credit move to where they serve best." },
  { n: 4, name: "Have courageous conversations", def: "We address issues directly with the person involved." },
  { n: 5, name: "Continuously improve our craft", def: "We seek feedback, learn fast, and share openly." },
  { n: 6, name: "Practice Joy", def: "We uplift others, especially in tough moments." },
];

function buildPrompt(entriesText) {
  return `You are helping an employee prepare their People Analyzer self-assessment at Taleemabad. You are given their real work-log entries from this cycle. Map them to the 6 core values below and draft evidence for each, using ONLY what is in the entries.

THE 6 VALUES:
${VALUES.map(v => `${v.n}. ${v.name} — ${v.def}`).join('\n')}

RATING SCALE:
"+"   = exhibits this value most of the time
"+/-" = sometimes yes, sometimes no
"-"   = does not exhibit it most of the time

WORK-LOG ENTRIES:
${entriesText}

For EACH of the 6 values produce:
- "rating": "+", "+/-", or "-" — judged honestly from the evidence available. If there is little or no evidence for a value, use "+/-" and say so plainly.
- "evidence": 2-4 sentences of evidence written in the Situation-Behavior-Impact style, drawn from the REAL entries above.

STRICT writing rules for "evidence":
- First person ("I ..."). Plain, natural, human English — the way a normal person writes, NOT corporate or AI language.
- Avoid words like "proactively", "seamlessly", "leveraged", "ensured optimal", "diligently", "spearheaded".
- Use ONLY facts from the entries. Reference the actual situations/names. Do NOT invent anything.
- Be honest and a little humble; do not oversell.

Respond ONLY with JSON, no extra text:
{"values": [{"n": 1, "name": "...", "rating": "+", "evidence": "..."}, ... all 6 ...]}`;
}

async function generateAssessment(entries) {
  if (!entries || entries.length === 0) {
    throw new Error('No entries to generate from');
  }
  const entriesText = entries
    .map((e, i) => `${i + 1}. [${e.date}${e.category ? ', ' + e.category : ''}] ${e.entry}`)
    .join('\n');

  const result = await retry(async () => {
    const model = genAI.getGenerativeModel({ model: config.gemini.model });
    const r = await model.generateContent(buildPrompt(entriesText));
    if (!r || !r.response) throw new Error('Empty response from Gemini');
    let raw = r.response.text().trim();
    logger.info(`[pa] generate raw: ${raw.slice(0, 150)}...`);
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(raw);
    if (!parsed.values || !Array.isArray(parsed.values)) throw new Error('Bad response shape');
    return parsed.values;
  });

  // Normalize + benchmark check.
  const values = VALUES.map(v => {
    const found = result.find(x => x.n === v.n) || {};
    let rating = (found.rating || '+/-').trim();
    if (!['+', '+/-', '-'].includes(rating)) rating = '+/-';
    return { n: v.n, name: v.name, def: v.def, rating, evidence: (found.evidence || '').trim() };
  });

  const plus = values.filter(v => v.rating === '+').length;
  const pm = values.filter(v => v.rating === '+/-').length;
  const minus = values.filter(v => v.rating === '-').length;
  const benchmarkMet = plus >= 4 && pm <= 2 && minus === 0;

  return {
    values,
    summary: { plus, plusMinus: pm, minus, benchmarkMet, entryCount: entries.length },
  };
}

module.exports = { generateAssessment, VALUES };
