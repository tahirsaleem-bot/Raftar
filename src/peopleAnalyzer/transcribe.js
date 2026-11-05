// Transcribe a voice note (WAV) into clean, natural, human-sounding English.
// Input may be mixed Urdu + English; output must read like a person wrote it — not AI.
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const logger = require('../logger');
const { retry } = require('../utils/retry');

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

const PROMPT = `You are transcribing a short voice note from a field/operations employee logging something they did at work today. The speaker mixes Urdu and English (Roman Urdu).

Your job:
1. Understand what they said.
2. Write it as ONE short work-log entry in clear, simple ENGLISH.

Strict rules for the output text:
- Write in first person ("I ...") exactly as a normal person would jot a note. Plain, everyday words.
- Translate the Urdu parts to English. Keep proper nouns (names, places) as-is.
- Do NOT add anything they did not say. No assumptions, no filler, no praise.
- Do NOT use flowery, corporate, or AI-sounding words (avoid: "proactively", "seamlessly", "leveraged", "ensured optimal", "diligently", etc.). Keep it natural and humble.
- Keep it concise — 1 to 3 sentences. Just the facts of what happened.
- Fix obvious speech errors but keep the meaning faithful.

Also pick ONE category that best fits: Logistics, Admin, IT, Team, or Other.

Respond ONLY with JSON, no extra text:
{"entry": "<clean english entry>", "category": "<one category>"}`;

async function transcribeAudio(audioBuffer, mimeType = 'audio/wav') {
  return await retry(async () => {
    const model = genAI.getGenerativeModel({ model: config.gemini.model });
    const result = await model.generateContent([
      { inlineData: { data: audioBuffer.toString('base64'), mimeType } },
      PROMPT,
    ]);
    if (!result || !result.response) throw new Error('Empty response from Gemini');
    let raw = result.response.text().trim();
    logger.info(`[pa] transcription raw: ${raw.slice(0, 200)}`);
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Fallback: treat whole response as the entry.
      parsed = { entry: raw, category: 'Other' };
    }
    if (!parsed.entry || !parsed.entry.trim()) throw new Error('No speech detected in audio');
    const allowed = ['Logistics', 'Admin', 'IT', 'Team', 'Other'];
    if (!allowed.includes(parsed.category)) parsed.category = 'Other';
    return { entry: parsed.entry.trim(), category: parsed.category };
  });
}

module.exports = { transcribeAudio };
