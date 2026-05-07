const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const logger = require('../logger');
const { retry } = require('../utils/retry');

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// ─── Extract KM/odometer reading from an image using Gemini Vision ────────────
async function extractKMFromImage(imageBuffer, senderName = 'Unknown') {
  return await retry(async () => {
    const model = genAI.getGenerativeModel({ model: config.gemini.model });

    const base64Image = imageBuffer.toString('base64');
    const mimeType = detectMimeType(imageBuffer);

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Image,
          mimeType,
        },
      },
      `This image was sent by a field employee named "${senderName}" to report their vehicle odometer reading.

The image may be:
- A photo of a vehicle odometer showing total KM
- A screenshot of a GPS/maps app showing distance
- A screenshot of a tracking app

Extract ONLY the odometer/meter reading number shown in the image.

Respond in this exact JSON format with no extra text:
{"km": <number or null>, "confidence": "high" or "medium" or "low", "reason": "<only if km is null>"}`,
    ]);

    const raw = result.response.text().trim();
    logger.info(`[vision] Gemini response for ${senderName}: ${raw}`);

    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.km === null || parsed.km === undefined) {
      return { success: false, reason: parsed.reason || 'No KM value found in image' };
    }

    const km = parseFloat(parsed.km);
    if (isNaN(km)) {
      return { success: false, reason: 'Extracted value is not a valid number' };
    }

    return { success: true, km, confidence: parsed.confidence };
  }, { label: '[vision]' }).catch(err => {
    logger.error(`[vision] Gemini error for ${senderName}:`, err.message);
    return { success: false, reason: `Vision error: ${err.message}` };
  });
}

// ─── Detect MIME type from buffer magic bytes ─────────────────────────────────
function detectMimeType(buffer) {
  const hex = buffer.slice(0, 4).toString('hex');
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e47')) return 'image/png';
  if (hex.startsWith('47494638')) return 'image/gif';
  if (hex.startsWith('52494646')) return 'image/webp';
  return 'image/jpeg';
}

module.exports = { extractKMFromImage };
