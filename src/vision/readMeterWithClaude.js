// ─── Read a vehicle meter with Claude vision ──────────────────────────────────
// Tesseract is unreliable on these photos: the reading sits in a small amber LCD
// while the analog speedometer dial (20/40/…/140, "km/h") is crisply printed, so
// OCR keeps returning dial markings. Claude can tell the two apart, which is the
// whole reason this path exists. See src/vision/extractKM.js for the Tesseract
// fallback and the history of that failure.
//
// Enabled only when ANTHROPIC_API_KEY is set (paid API — CLAUDE.md rule 2).
// Without a key, callers fall back to Tesseract automatically.

const logger = require('../logger');

const MODEL = process.env.METER_VISION_MODEL || 'claude-opus-5';

// Cached across calls; building the client per image is wasteful.
let clientPromise = null;
let schemaCache = null;

// The SDK resolves ANTHROPIC_API_KEY first, then ANTHROPIC_AUTH_TOKEN (used for
// OAuth tokens, which are short-lived — prefer a real API key on a server).
function isEnabled() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const mod = require('@anthropic-ai/sdk');
      const Anthropic = mod.default || mod;
      return new Anthropic(); // resolves ANTHROPIC_API_KEY from the environment
    })().catch(err => { clientPromise = null; throw err; });
  }
  return clientPromise;
}

function getSchema() {
  if (!schemaCache) {
    // Must be the v4 subpath: the SDK's zodOutputFormat reads zod v4 internals,
    // and the bare `require('zod')` (v3 API in zod 3.25.x) throws
    // "Cannot read properties of undefined (reading 'def')".
    const { z } = require('zod/v4');
    const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
    const MeterReading = z.object({
      is_meter: z.boolean().describe('true only if this is a photo of a vehicle dashboard / meter'),
      km: z.number().nullable().describe('the reading exactly as displayed, or null if it cannot be read'),
      confidence: z.enum(['high', 'medium', 'low']),
      reason: z.string().describe('short explanation, especially when km is null'),
    });
    schemaCache = zodOutputFormat(MeterReading);
  }
  return schemaCache;
}

// The prompt carries the domain rule that OCR kept breaking. It deliberately
// tells Claude what NOT to read, because the wrong numbers are the easy ones.
function buildPrompt(hubName, meterType) {
  const expectation = meterType === 'odometer'
    ? `This hub ("${hubName}") normally logs a running ODOMETER total, so a genuine reading is usually 5-6 digits (e.g. 106904).`
    : `This hub ("${hubName}") normally logs a TRIP meter that the driver resets each morning, so a genuine reading is usually small (0 to about 200) and is often exactly 0.`;

  return [
    'This is a photo sent by a field driver to report a vehicle meter reading.',
    '',
    'Read ONLY the digital display — the small backlit LCD panel (usually amber/orange',
    'or green) that shows the odometer / trip distance as digits.',
    '',
    'NEVER report a number from the analog speedometer dial. The numbers printed',
    'around the dial face (20, 40, 60, 80, 100, 120, 140, and anything next to',
    '"km/h" or "mph") are SPEED MARKINGS, not the reading. They are printed more',
    'clearly than the LCD, which is exactly why they get misread. Ignore them.',
    'Also ignore the phone status bar (clock, battery %, signal).',
    '',
    expectation,
    'Report what is ACTUALLY displayed, even if it disagrees with that expectation.',
    'Never guess a value to match the expectation, and never round.',
    '',
    'Specific cases:',
    '- If the LCD shows 0, 00 or 000, that is a real reading: return km = 0.',
    '- If the LCD shows a decimal (e.g. 24.6), keep the decimal.',
    '- If the digits are unreadable, blurry, or cropped out, return km = null and',
    '  say so in reason. Do NOT fall back to a dial number.',
    '- If this is not a vehicle meter photo at all (a receipt, a chat screenshot,',
    '  a ride summary, a notice), set is_meter = false and km = null.',
  ].join('\n');
}

// ─── Read one image ───────────────────────────────────────────────────────────
// Returns the same shape as extractKMFromImage() so callers can swap freely:
//   { success, km, confidence, source } | { success: false, reason }
async function readMeterWithClaude(imageBuffer, opts = {}) {
  const { senderName = 'Unknown', hubName = 'unknown hub', meterType = 'trip', mimeType } = opts;

  if (!isEnabled()) {
    return { success: false, reason: 'No Anthropic credential set (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN)' };
  }

  const media_type = (mimeType && String(mimeType).startsWith('image/')) ? mimeType : 'image/jpeg';

  try {
    const client = await getClient();
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: imageBuffer.toString('base64') } },
            { type: 'text', text: buildPrompt(hubName, meterType) },
          ],
        },
      ],
      output_config: { format: getSchema() },
    });

    // stop_details is only populated for a refusal, so guard before reading it.
    if (response.stop_reason === 'refusal') {
      logger.warn(`[vision-claude] Refused for ${senderName}: ${response.stop_details?.category || 'unknown'}`);
      return { success: false, reason: 'Model declined to process this image' };
    }

    const out = response.parsed_output;
    if (!out) {
      logger.warn(`[vision-claude] No parsed output for ${senderName}`);
      return { success: false, reason: 'Vision response could not be parsed' };
    }

    const usage = response.usage || {};
    logger.info(`[vision-claude] ${senderName} (${hubName}/${meterType}) → is_meter=${out.is_meter} km=${out.km} conf=${out.confidence} in=${usage.input_tokens || '?'} out=${usage.output_tokens || '?'} | ${out.reason || ''}`);

    if (!out.is_meter) {
      return { success: false, reason: `Not a meter image: ${out.reason || 'no meter visible'}` };
    }
    if (out.km === null || !Number.isFinite(out.km)) {
      return { success: false, reason: `Could not read the display: ${out.reason || 'unreadable'}` };
    }

    return { success: true, km: out.km, confidence: out.confidence, source: 'claude-vision' };
  } catch (err) {
    // Never let a vision failure kill the message handler — the caller falls
    // back to Tesseract.
    logger.error(`[vision-claude] Failed for ${senderName}: ${err.message}`);
    return { success: false, reason: `Vision error: ${err.message}` };
  }
}

module.exports = { readMeterWithClaude, isEnabled, MODEL };
