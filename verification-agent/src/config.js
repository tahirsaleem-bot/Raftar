// Central settings. Secrets come from Railway env vars only.
module.exports = {
  PORT: Number(process.env.PORT || 3000),
  DATA_DIR: process.env.DATA_DIR || '/data',
  APP_PIN: process.env.APP_PIN || '',
  SENDER_EMAIL: 'tahir.saleem@niete.edu.pk',
  SENDER_NAME: 'Tahir Saleem',
  SIGNATURE_TEAM: 'People & Culture | Taleemabad (NIETE)',
  CC: process.env.VERIFY_CC || 'hiring@taleemabad.com',
  REMINDER_DAYS: Number(process.env.REMINDER_DAYS || 3),          // org reminder after N days without reply
  CONTACT_REMINDER_DAYS: Number(process.env.CONTACT_REMINDER_DAYS || 2),
  RESPONSE_DAYS: Number(process.env.RESPONSE_DAYS || 7),          // deadline written in the verification email
  POLL_MINUTES: Number(process.env.POLL_MINUTES || 15),
  MODEL: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
  PKT_OFFSET_MIN: 300,                                            // Pakistan Standard Time, UTC+5
  // SHA-256 of the bearer token the hourly Claude Code routine uses for /agent/*. Only the hash lives here;
  // the token itself is in the routine's prompt. Rotate by generating a new token and replacing this hash.
  AGENT_TOKEN_SHA256: process.env.AGENT_TOKEN_SHA256 || 'ceef86510178e4cd679db4911e2b3f9994f9c4d9ecd9ac99c784c5505f54f35c',
};
