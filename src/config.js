// Central settings. Secrets come from Railway env vars only - nothing sensitive lives here.
module.exports = {
  PORT: Number(process.env.PORT || 3000),
  DATA_DIR: process.env.DATA_DIR || '/data',
  APP_PIN: process.env.APP_PIN || '',

  // Sign-in with the Raftar dashboard email + password (2026-10-26). The password is
  // checked by the meter-reading service; only the emails listed here get in, because
  // dashboard access alone must never open exit interview records.
  METER_URL: process.env.METER_URL || 'https://meter-reading-production-2d7f.up.railway.app',
  METER_AUTH_KEY: process.env.METER_AUTH_KEY || '',
  SESSION_SECRET: process.env.SESSION_SECRET || '',
  EXIT_ALLOWED_EMAILS: (process.env.EXIT_ALLOWED_EMAILS || 'tahir.saleem@niete.edu.pk')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),

  SENDER_EMAIL: 'tahir.saleem@niete.edu.pk',
  SENDER_NAME: 'Tahir Saleem',

  // Only requests from these senders start a case. In practice the request is a reply on
  // the leaver's own resignation thread from People & Culture - "pls set up an exit
  // interview by understanding: her experience" - so the person who writes that line is
  // the sender to list here, not the hr@ alias, which is a hiring mailbox.
  HR_SENDERS: (process.env.HR_SENDERS || 'jawwad.ali@taleemabad.com')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),

  // Where a finished record is sent, always. Deliberately NOT derived from whoever
  // triggered the case: once any resignation email can open a case, the trigger sender is
  // usually the departing person themselves, and replying to them would deliver a
  // confidential record - naming their manager, sometimes a harassment disclosure - to
  // the one person who must never receive it.
  RECORD_TO: process.env.RECORD_TO || 'jawwad.ali@taleemabad.com',

  // Copied on the record and on the invite. People & Culture work off the hr@ alias, so a
  // record that reaches only the one person who asked for it is not actually filed with
  // the team. Tahir's own replies on these threads always carried hr@ as well.
  RECORD_CC: (process.env.RECORD_CC || 'hr@taleemabad.com')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),

  // Google Drive folder that finished records are filed into.
  DRIVE_FOLDER_ID: process.env.DRIVE_FOLDER_ID || '1a2YuncRokDfF53F3XKX_jRr1O5K4kVta',  // "Exit Interviews"

  // The notetakers whose meeting summaries we read back after the interview.
  NOTETAKER_SENDERS: ['rumi@hellorumi.ai', 'no-reply@fathom.video', 'no-reply@otter.ai'],

  // Notetakers invited to the interview itself. They have to be on the invite to join and
  // record - and if none of them attends, there is no summary later and the whole drafting
  // stage has nothing to work from.
  NOTETAKER_INVITE: (process.env.NOTETAKER_INVITE || 'rumi@hellorumi.ai')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),

  POLL_MINUTES: Number(process.env.POLL_MINUTES || 15),
  INTERVIEW_MINUTES: Number(process.env.INTERVIEW_MINUTES || 60),

  // How long after the scheduled slot we keep looking for a notetaker summary before
  // giving up and asking for it by hand.
  NOTES_WAIT_HOURS: Number(process.env.NOTES_WAIT_HOURS || 48),

  MODEL: process.env.CLAUDE_MODEL || 'claude-opus-5',

  // SHA-256 of the bearer token the scheduled Claude Code routine presents on /agent/*.
  // Only the hash lives here; the token itself sits in the routine's prompt. Rotating
  // means generating a new token and replacing this hash.
  AGENT_TOKEN_SHA256: process.env.AGENT_TOKEN_SHA256 || '',
  PKT_OFFSET_MIN: 300,   // Pakistan Standard Time, UTC+5

  // Where the nudge emails point. Set this if the service ever moves.
  APP_URL: process.env.APP_URL || 'https://exit-interview-agent-production.up.railway.app',

  // The two moments a case actually needs Tahir: a slot to be picked, and a draft to be
  // read. Mailing him at those points is what stops a case sitting unnoticed - he had no
  // way of knowing one had arrived. Deliberately not every stage change; the machine
  // steps in between are not his to act on.
  NOTIFY: (process.env.NOTIFY ?? 'true') !== 'false',
};
