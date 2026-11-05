// ─── Where incoming meter photos are stored ───────────────────────────────────
// These used to be written to <project>/output/meter_debug, which is INSIDE the
// container and therefore wiped on every deploy and restart. The Railway volume
// is mounted at /app/credentials, so nothing under /app/output survives — three
// deploys on 2026-09-08 left the directory empty and every saved photo was lost.
//
// So: write under the volume when it is there, and fall back to the old local
// path for development. Override with METER_IMAGE_DIR.

const fs = require('fs');
const path = require('path');

// <repo>/credentials is the volume mount point on Railway (/app/credentials).
const VOLUME_DIR = path.join(__dirname, '..', '..', 'credentials');
const LOCAL_FALLBACK = path.join(__dirname, '..', '..', 'output', 'meter_debug');

function meterImageDir() {
  if (process.env.METER_IMAGE_DIR) return process.env.METER_IMAGE_DIR;
  try {
    if (fs.existsSync(VOLUME_DIR)) return path.join(VOLUME_DIR, 'meter_debug');
  } catch {
    // fall through to the local path
  }
  return LOCAL_FALLBACK;
}

module.exports = { meterImageDir };
