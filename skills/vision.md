# Skill: Vision Extraction (Gemini)

## Purpose
Extract KM numbers from meter photos using Google Gemini Vision API.

---

## Prerequisites
- Google Gemini API key (in .env as GEMINI_API_KEY)
- Image in base64 format or buffer
- 1,500 free API calls/day quota

---

## Instructions

### 1. Extract KM from Image
```javascript
const { extractKM } = require('./src/vision/extractKM.js');

const imageBuffer = fs.readFileSync('./meter-photo.jpg');
const result = await extractKM(imageBuffer);

// result: { km: 245, confidence: 'high' }
```

### 2. Validate Extraction
```javascript
const { km, confidence } = result;

if (confidence === 'low') {
  console.warn('Low confidence, manual review recommended');
}

if (km < 0 || km > 500) {
  console.error(`Invalid KM: ${km}, must be 0-500`);
}
```

### 3. Handle Failures
```javascript
try {
  const result = await extractKM(imageBuffer);
  if (!result.km) {
    console.error('Could not extract KM, manual entry needed');
  }
} catch (error) {
  if (error.code === 'RESOURCE_EXHAUSTED') {
    console.error('Gemini quota exceeded, wait until tomorrow');
  }
}
```

---

## Examples

### Process WhatsApp Meter Photo
```javascript
async function processMeterPhoto(whatsappMessage) {
  // Download image from WhatsApp
  const media = await whatsappMessage.downloadMedia();
  const buffer = Buffer.from(media.data, 'base64');
  
  // Extract KM via Gemini
  const { km, confidence } = await extractKM(buffer);
  
  // Validate
  if (km < 0 || km > 500 || confidence === 'low') {
    console.error(`Invalid or low-confidence: ${km} KM (${confidence})`);
    return null;
  }
  
  return km;
}
```

### Batch Extract from Directory
```javascript
async function batchExtract(directory) {
  const files = fs.readdirSync(directory);
  const results = [];
  
  for (const file of files) {
    const buffer = fs.readFileSync(`${directory}/${file}`);
    const result = await extractKM(buffer);
    results.push({ file, ...result });
    
    // Rate limiting
    await sleep(500);
  }
  
  return results;
}
```

---

## Common Mistakes

### Mistake 1: Wrong Image Format
❌ Bad: Send PNG with transparency (Gemini may struggle)  
✅ Fix: Convert to JPEG or ensure opaque PNG
```bash
convert meter.png -background white -flatten meter.jpg
```

### Mistake 2: Image Too Small/Blurry
❌ Bad: Send 100×100 pixel thumbnail  
✅ Fix: Use high-resolution photo (800×600 minimum)

### Mistake 3: Not Handling Quota Exceeded
❌ Bad: Ignore RESOURCE_EXHAUSTED error  
✅ Fix: Catch and retry next day
```javascript
if (error.message.includes('RESOURCE_EXHAUSTED')) {
  console.error('Quota exceeded. Limit: 1500/day');
  // Store for manual extraction later
}
```

### Mistake 4: Trusting Low Confidence Results
❌ Bad: Accept `confidence: 'low'` KM values  
✅ Fix: Require human review for low confidence
```javascript
if (confidence === 'low') {
  return { error: 'Manual review needed', km, confidence };
}
```

### Mistake 5: No Timeout on API Calls
❌ Bad: Wait forever for Gemini to respond  
✅ Fix: Set timeout (10 seconds)
```javascript
const timeout = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Timeout')), 10000)
);
const result = await Promise.race([extractKM(buffer), timeout]);
```

---

## Code Reference
- **Main file:** `/src/vision/extractKM.js`
- **API:** Google Gemini Vision (v1.5-flash)
- **Library:** `@google/generative-ai`
- **Key functions:**
  - `extractKM(imageBuffer)` — Returns { km, confidence }
- **Rate limit:** 1,500 requests/day (free tier)
- **Last updated:** 2026-04-21

---

## Notes

1. **Accuracy:** ~98% on clear photos, ~70% on blurry
2. **Confidence levels:** high / medium / low
3. **KM range:** Must be 0-500 (meter readings for vehicles)
4. **Image size:** Keep <20MB
5. **Processing time:** 1-3 seconds per image
6. **Fallback:** If extraction fails, show manual entry prompt

---

**Last Updated:** 2026-04-21  
**Complexity:** Low  
**Linked Skills:** sheets (to store results), error-handling
