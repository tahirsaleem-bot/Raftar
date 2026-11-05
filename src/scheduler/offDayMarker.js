const cron = require('node-cron');
const { ALL_HUBS } = require('../config/hubGroups');
const { todayISO, isWorkday, forHub } = require('../sheets/logisticsClient');
const logger = require('../logger');

// ─── Night-time "off" marker ──────────────────────────────────────────────────
// Rule from Tahir (2026-10-21): if a hub had no visit that day, its row is not
// left blank — FPU, LDO and Total say "off" (chhutti).
// "No visit" is decided conservatively: the hub's group sent NO photo at all
// all day AND both readings are still blank. If any photo arrived but the
// reading is missing, the row is left blank and logged — that is a reading to
// enter by hand, not a holiday.
async function runOffDayMarker() {
  const tz = process.env.TIMEZONE || 'Asia/Karachi';
  const dateStr = todayISO(tz);
  if (!isWorkday(dateStr)) return;
  const { hubPhotoCount } = require('../whatsapp/whatsappClient');
  logger.info(`[off] Checking for no-visit hubs on ${dateStr}`);

  for (const hub of ALL_HUBS()) {
    try {
      const fleetCfg = require('../config/hubGroups').FLEETS[hub.fleet || 'islamabad'];
      if (fleetCfg && fleetCfg.offMarkFrom && dateStr < fleetCfg.offMarkFrom) continue;
      const { findHubRow, markOff, COL } = forHub(hub.hubName); // Islamabad or Rawalpindi tab
      const found = await findHubRow(hub.hubName, dateStr);
      if (!found) { logger.warn(`[off] No row for ${hub.hubName} on ${dateStr}`); continue; }
      const j = String(found.row[COL.fpu] || '').trim(), k = String(found.row[COL.ldo] || '').trim();
      if (j !== '' || k !== '') continue; // has a reading (or already off)
      const photos = hubPhotoCount(hub.hubName, dateStr);
      if (photos > 0) {
        logger.warn(`[off] ${hub.hubName}: ${photos} photo(s) today but no reading — left blank for manual entry`);
        continue;
      }
      const r = await markOff(hub.hubName, dateStr);
      if (r.success) logger.info(`[off] ${hub.hubName}: no photo all day — marked off (row ${r.rowNumber})`);
      else logger.warn(`[off] ${hub.hubName}: not marked off — ${r.reason}`);
    } catch (err) {
      logger.error(`[off] ${hub.hubName}: ${err.message}`);
    }
  }
}

function startOffDayScheduler() {
  const checkTime = process.env.OFF_MARK_TIME || '21:00';
  const [hour, minute] = checkTime.split(':').map(Number);
  logger.info(`[off] Off-day marker started — runs daily at ${checkTime} PKT`);
  cron.schedule(`${minute} ${hour} * * *`, () => {
    runOffDayMarker().catch(err => logger.error('[off] Cron error:', err.message));
  }, { timezone: process.env.TIMEZONE || 'Asia/Karachi' });
}

module.exports = { startOffDayScheduler, runOffDayMarker };
