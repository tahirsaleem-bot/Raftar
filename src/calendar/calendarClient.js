const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

const CREDENTIALS_PATH = path.join(__dirname, '..', '..', 'credentials', 'google-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, '..', '..', 'credentials', 'google-token.json');

// ─── Build authenticated Calendar client ─────────────────────────────────────
function getAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH)) throw new Error('OAuth credentials not found. Run: node scripts/authorize.js');
  if (!fs.existsSync(TOKEN_PATH)) throw new Error('OAuth token not found. Run: node scripts/authorize.js');

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const { client_id, client_secret } = credentials.installed || credentials.web;

  const auth = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3001/callback');
  auth.setCredentials(token);
  return auth;
}

function getCalendarClient() {
  return google.calendar({ version: 'v3', auth: getAuthClient() });
}

// ─── List all calendars in the account ───────────────────────────────────────
async function listCalendars() {
  try {
    const calendar = getCalendarClient();
    const res = await calendar.calendarList.list();
    const calendars = (res.data.items || []).map(c => ({
      id: c.id,
      name: c.summary,
      primary: c.primary || false,
      accessRole: c.accessRole,
    }));

    logger.info(`[calendar] Found ${calendars.length} calendar(s)`);
    return { success: true, calendars };
  } catch (err) {
    logger.error('[calendar] Failed to list calendars:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Get upcoming events ──────────────────────────────────────────────────────
async function getUpcomingEvents({ calendarId = 'primary', maxResults = 10, daysAhead = 7 } = {}) {
  try {
    const calendar = getCalendarClient();

    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

    const res = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = (res.data.items || []).map(formatEvent);
    logger.info(`[calendar] Retrieved ${events.length} upcoming event(s)`);
    return { success: true, events };
  } catch (err) {
    logger.error('[calendar] Failed to get events:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Get events for a specific date range ─────────────────────────────────────
async function getEventsBetween(startDate, endDate, calendarId = 'primary') {
  try {
    const calendar = getCalendarClient();

    const res = await calendar.events.list({
      calendarId,
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = (res.data.items || []).map(formatEvent);
    return { success: true, events };
  } catch (err) {
    logger.error('[calendar] Failed to get events in range:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Create a new calendar event ─────────────────────────────────────────────
async function createEvent({ title, description = '', startDateTime, endDateTime, attendees = [], calendarId = 'primary', timezone = 'Asia/Karachi' }) {
  try {
    const calendar = getCalendarClient();

    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: title,
        description,
        start: { dateTime: new Date(startDateTime).toISOString(), timeZone: timezone },
        end: { dateTime: new Date(endDateTime).toISOString(), timeZone: timezone },
        attendees: attendees.map(email => ({ email })),
      },
    });

    logger.info(`[calendar] Event created: "${title}" — id: ${res.data.id}`);
    return { success: true, event: formatEvent(res.data) };
  } catch (err) {
    logger.error('[calendar] Failed to create event:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Helper: format event for consistent output ───────────────────────────────
function formatEvent(e) {
  return {
    id: e.id,
    title: e.summary || '(No title)',
    description: e.description || '',
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    location: e.location || '',
    attendees: (e.attendees || []).map(a => a.email),
    link: e.htmlLink,
  };
}

module.exports = { listCalendars, getUpcomingEvents, getEventsBetween, createEvent };
