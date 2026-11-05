// ─── Daily petrol price ───────────────────────────────────────────────────────
// BusCaro bills the "variable" part of each route as  km ÷ 12 × that day's
// petrol rate  (verified against the Sep-2026 invoice: G-13, 1 Sep, 75 km →
// 6.25 L × Rs 342.79 = Rs 2,142.44; the same rate applies to every route).
//
// Pakistan has priced fuel DAILY since July 2026 (OGRA notification each
// working day). The rate BusCaro bills is that official daily rate, carried
// forward over days with no notification (weekends): e.g. 26 Sep (Sat)
// 391.30 was billed on Mon 28 Sep. So:
//   * PakWheels publishes the dated history  →  primary source, back-fills
//     https://www.pakwheels.com/petroleum-prices-in-pakistan
//   * PSO publishes today's price only (its "Effective from" date sits in an
//     HTML comment and is stale)  →  cross-check / fallback for today
// Stored on the persistent volume:  credentials/fuel_prices.json
//   { "daily": { "2026-10-23": { "premier": 377.71, "source": "PakWheels" }, … }, "lastFetch": … }
// A day's rate = the latest dated entry on/before it (carry-forward).
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
const logger = require('../logger');

const FILE = path.join(__dirname, '..', '..', 'credentials', 'fuel_prices.json');
const PAKWHEELS = 'https://www.pakwheels.com/petroleum-prices-in-pakistan';
const PSO = 'https://psopk.com/en/fuels/fuel-prices';
const UA = { 'User-Agent': 'Mozilla/5.0 (Raftar fleet dashboard)' };

function load() {
  try {
    const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return db.daily ? db : { daily: {}, lastFetch: db.lastFetch || null }; // pre-daily file shape
  } catch { return { daily: {}, lastFetch: null }; }
}
function save(db) { fs.writeFileSync(FILE, JSON.stringify(db, null, 2)); }

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const okPrice = p => p > 100 && p < 1000; // a petrol price in Rs/litre

// "History of Petrol Prices in Pakistan" table → { iso: price }
function parsePakwheels(html) {
  const text = String(html);
  const start = text.indexOf('History of Petrol Prices');
  if (start < 0) return null;
  const end = text.indexOf('</table>', start);
  const table = text.slice(start, end > 0 ? end : start + 200000);
  const out = {};
  const re = /<td[^>]*>\s*(\d{1,2})(?:&nbsp;|\s)+([A-Za-z]+)\s+(\d{4})\s*<\/td>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)\s*<\/td>/g;
  let m;
  while ((m = re.exec(table))) {
    const mon = MONTHS[m[2].toLowerCase()];
    const price = parseFloat(m[4].replace(/,/g, ''));
    if (!mon || !okPrice(price)) continue;
    const iso = `${m[3]}-${String(mon).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
    if (!(iso in out)) out[iso] = price; // newest row first; first wins
  }
  return Object.keys(out).length ? out : null;
}

// PSO page → today's premier petrol price (no trustworthy date)
function parsePso(html) {
  const m = String(html).match(/\/premier\.png"[\s\S]{0,400}?Rs\.?\s*([\d,]+(?:\.\d+)?)\s*\/\s*Ltr/i);
  const p = m ? parseFloat(m[1].replace(/,/g, '')) : null;
  return okPrice(p) ? p : null;
}

async function fetchAndStore() {
  const db = load();
  const today = require('../sheets/logisticsClient').todayISO();
  let added = 0;
  try {
    const res = await axios.get(PAKWHEELS, { timeout: 30000, headers: UA });
    const hist = parsePakwheels(res.data);
    if (!hist) logger.warn('[fuel] PakWheels page fetched but the history table could not be parsed');
    else for (const [iso, price] of Object.entries(hist)) {
      if (iso > today) continue;
      const cur = db.daily[iso];
      if (!cur || cur.premier !== price) {
        if (cur && cur.premier !== price) logger.warn(`[fuel] ${iso} petrol revised ${cur.premier} → ${price}`);
        db.daily[iso] = { premier: price, source: 'PakWheels' };
        added++;
      }
    }
  } catch (err) {
    logger.warn(`[fuel] PakWheels fetch failed: ${err.message}`);
  }
  // PSO: today's price. Record it for today only if PakWheels has nothing for
  // today and it differs from the carried-forward rate (i.e. a change PakWheels
  // has not listed yet).
  try {
    const res = await axios.get(PSO, { timeout: 30000, headers: UA });
    const p = parsePso(res.data);
    const carried = priceOn(today, 'premier', db);
    if (p && !db.daily[today] && (!carried || carried.price !== p)) {
      db.daily[today] = { premier: p, source: 'PSO' };
      added++;
      logger.info(`[fuel] PSO shows a new petrol price Rs ${p}/L — recorded for ${today}`);
    } else if (p && carried && carried.price !== p) {
      logger.warn(`[fuel] PSO Rs ${p} differs from recorded Rs ${carried.price} for ${today}`);
    }
  } catch (err) {
    logger.warn(`[fuel] PSO fetch failed: ${err.message}`);
  }
  db.lastFetch = new Date().toISOString();
  save(db);
  if (added) logger.info(`[fuel] Stored ${added} new/updated daily petrol price(s); latest ${JSON.stringify(priceOn(today, 'premier', db))}`);
  return added;
}

// Rate (Rs/litre) for an ISO date: the latest dated entry on/before it.
// `effective` is the notification date the rate came from.
function priceOn(iso, product = 'premier', db = load()) {
  let best = null;
  for (const [d, v] of Object.entries(db.daily)) {
    if (d <= iso && v[product] != null && (!best || d > best.d)) best = { d, v };
  }
  return best ? { price: best.v[product], effective: best.d, source: best.v.source, exact: best.d === iso } : null;
}

function startFuelPriceScheduler() {
  fetchAndStore(); // on boot (also back-fills history)
  // OGRA notifies late at night, effective 00:00 — check after midnight,
  // in the morning and in the evening.
  for (const expr of ['30 0 * * *', '5 8 * * *', '5 18 * * *']) {
    cron.schedule(expr, () => { fetchAndStore(); }, { timezone: process.env.TIMEZONE || 'Asia/Karachi' });
  }
  logger.info('[fuel] Daily petrol price scheduler started — 00:30, 08:05, 18:05 PKT (PakWheels history + PSO)');
}

module.exports = { parsePakwheels, parsePso, fetchAndStore, priceOn, load, startFuelPriceScheduler };
