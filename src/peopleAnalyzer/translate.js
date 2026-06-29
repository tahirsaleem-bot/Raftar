// Free, no-API-key translation to English (Google Translate public endpoint).
// Used for the voice log: browser Web Speech gives raw (Urdu/English) text,
// this turns it into natural human English. Plus a light keyword category guess.
const https = require('https');

function translateToEnglish(text) {
  return new Promise((resolve, reject) => {
    const clean = (text || '').trim();
    if (!clean) return resolve('');
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=' + encodeURIComponent(clean);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        if (r.statusCode !== 200) return reject(new Error('translate http ' + r.statusCode));
        try {
          const j = JSON.parse(d);
          const eng = (j[0] || []).map(x => x[0]).join('');
          resolve(eng.trim() || clean);
        } catch (e) { reject(new Error('translate parse failed')); }
      });
    }).on('error', reject);
  });
}

const CAT_KEYS = {
  IT: ['laptop', 'bitlocker', 'printer', 'print', 'screen', 'wifi', 'sim', 'cctv', 'projector', 'anydesk', 'hdmi', 'software', 'windows', 'system', 'network', 'camera', 'tv', 'mic', 'speaker'],
  Logistics: ['car', 'driver', 'vehicle', 'pickup', 'pick up', 'route', 'coach', 'captain', 'ride', 'fuel', 'transport', 'suzuki'],
  Admin: ['kitchen', 'stock', 'ministry', 'document', 'event', 'refreshment', 'cake', 'purchase', 'market', 'daycare', 'snack', 'breakfast', 'metro', 'bouquet'],
  Team: ['farewell', 'support', 'colleague', 'session', 'training', 'help', 'team'],
};

function guessCategory(text) {
  const t = (text || '').toLowerCase();
  for (const [cat, keys] of Object.entries(CAT_KEYS)) {
    if (keys.some(k => t.includes(k))) return cat;
  }
  return 'Other';
}

module.exports = { translateToEnglish, guessCategory };
