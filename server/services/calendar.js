import { google } from 'googleapis';
import db from '../db/init.js';
import { getClient } from './gmail-oauth.js';
import { v4 as uuid } from 'uuid';

function gmailFor(channelId) {
  const client = getClient(channelId);
  if (!client) throw new Error(`Channel ${channelId} is not connected`);
  return google.calendar({ version: 'v3', auth: client });
}

function getConnectedEmailChannels() {
  return db.prepare(`
    SELECT c.* FROM channels c
    INNER JOIN oauth_tokens t ON t.channel_id = c.id
    WHERE c.type = 'email' AND c.is_active = 1
  `).all();
}

// Haal alle calendars op waar de gebruiker leesrechten op heeft (primary + gedeelde + import)
async function listAccessibleCalendars(calendarApi) {
  const { data } = await calendarApi.calendarList.list({ maxResults: 100 });
  return (data.items || [])
    .filter((c) => !c.hidden && (c.accessRole === 'owner' || c.accessRole === 'writer' || c.accessRole === 'reader'))
    .map((c) => ({
      id: c.id,
      summary: c.summaryOverride || c.summary || c.id,
      primary: !!c.primary,
      backgroundColor: c.backgroundColor || null,
      accessRole: c.accessRole,
    }));
}

// Normaliseer een datum-input naar RFC3339 (volledige ISO met tijd + zone).
// Google Calendar API accepteert geen "YYYY-MM-DD" — alleen volledig RFC3339.
function toRfc3339(input, fallback) {
  if (!input) return fallback;
  // Al volledig ISO met tijd?
  if (typeof input === 'string' && /T\d{2}:\d{2}/.test(input)) {
    // Mist timezone? Voeg Z toe.
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(input)) return `${input}Z`;
    return input;
  }
  // Date-only ("YYYY-MM-DD") of Date object → zet om naar volledige ISO
  const d = new Date(input);
  if (isNaN(d.getTime())) return fallback;
  return d.toISOString();
}

export async function listEvents({ channelId, timeMin, timeMax, maxResults = 50 } = {}) {
  const calendarApi = gmailFor(channelId);
  const ch = db.prepare('SELECT account_email FROM channels WHERE id = ?').get(channelId);

  const normalizedTimeMin = toRfc3339(timeMin, new Date().toISOString());
  const normalizedTimeMax = toRfc3339(timeMax, new Date(Date.now() + 7 * 86400000).toISOString());

  // Stap 1: alle toegankelijke calendars
  let calendars;
  try {
    calendars = await listAccessibleCalendars(calendarApi);
  } catch (e) {
    // calendarList.list zelf faalt vrijwel altijd met dezelfde reden als events.list
    // → gooi hetzelfde door zodat classifyCalendarError werkt
    throw e;
  }
  if (calendars.length === 0) {
    // Fallback: probeer dan primary direct (zou eigenlijk niet voorkomen)
    calendars = [{ id: 'primary', summary: 'Primary', primary: true, accessRole: 'owner' }];
  }

  // Stap 2: events per calendar
  const events = [];
  const seenIds = new Set();
  for (const cal of calendars) {
    try {
      let data;
      try {
        // Poging 1: met orderBy: 'startTime'
        const res = await calendarApi.events.list({
          calendarId: cal.id,
          timeMin: normalizedTimeMin,
          timeMax: normalizedTimeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults,
        });
        data = res.data;
      } catch (e1) {
        // Poging 2: zonder orderBy — sommige shared/group calendars geven "Bad Request"
        // op orderBy: 'startTime' (vooral resource/room calendars en bepaalde gedeelde agendas).
        console.log(`Calendar "${cal.summary}" retry without orderBy: ${e1.message}`);
        const res = await calendarApi.events.list({
          calendarId: cal.id,
          timeMin: normalizedTimeMin,
          timeMax: normalizedTimeMax,
          singleEvents: true,
          maxResults,
        });
        data = res.data;
      }
      for (const e of data.items || []) {
        // Dedupe op (calendar.id, event.id) per account — een event kan via meerdere calendars zichtbaar zijn
        const key = `${cal.id}|${e.id}`;
        if (seenIds.has(key)) continue;
        seenIds.add(key);
        events.push({
          id: e.id,
          title: e.summary || '(geen titel)',
          description: e.description || null,
          location: e.location || null,
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          all_day: !!e.start?.date && !e.start?.dateTime,
          attendees: (e.attendees || []).map((a) => ({ email: a.email, displayName: a.displayName, responseStatus: a.responseStatus })),
          calendar_email: ch?.account_email || null,
          calendar_id: cal.id,
          calendar_name: cal.summary,
          calendar_primary: cal.primary,
          calendar_color: cal.backgroundColor,
          channel_id: channelId,
          html_link: e.htmlLink,
          status: e.status,
        });
      }
    } catch (e) {
      // Per-calendar failure (bv. gedeelde calendar tijdelijk niet beschikbaar): log + ga door
      console.log(`Calendar "${cal.summary}" (${cal.id}) skip: ${e.message}`);
    }
  }
  return events;
}

function classifyCalendarError(message) {
  if (!message) return { code: 'unknown', message: 'Onbekende calendar-fout' };
  if (/has not been used in project|API has not been used|is disabled/i.test(message)) {
    return {
      code: 'api_disabled',
      message: 'Google Calendar API is uitgeschakeld in het Google Cloud project. Schakel het in en wacht een paar minuten.',
      enable_url: 'https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=758456638047',
    };
  }
  if (/insufficient.*scope|forbidden|insufficient_permissions|invalid_scope|access denied/i.test(message)) {
    return {
      code: 'scope_missing',
      message: 'Calendar-toegang ontbreekt in OAuth tokens. Verbind het email-kanaal opnieuw via Instellingen.',
    };
  }
  if (/invalid_grant|invalid_request|unauthorized_client/i.test(message)) {
    return { code: 'reauth_required', message: 'Token verlopen — verbind opnieuw via Instellingen.' };
  }
  return { code: 'unknown', message };
}

export async function listAllEvents({ timeMin, timeMax } = {}) {
  const channels = getConnectedEmailChannels();
  const all = [];
  const errors = [];
  for (const ch of channels) {
    try {
      const events = await listEvents({ channelId: ch.id, timeMin, timeMax });
      all.push(...events);
    } catch (e) {
      console.error(`Calendar list failed for ${ch.id}: ${e.message}`);
      errors.push({ channel_id: ch.id, account_email: ch.account_email, ...classifyCalendarError(e.message) });
    }
  }
  all.sort((a, b) => new Date(a.start) - new Date(b.start));
  return { events: all, errors };
}

export async function createEvent({ channelId, title, start, end, attendees, description, location }) {
  const calendar = gmailFor(channelId);

  const eventBody = {
    summary: title,
    description: description || undefined,
    location: location || undefined,
    start: typeof start === 'string' && /T\d/.test(start)
      ? { dateTime: start, timeZone: 'Europe/Amsterdam' }
      : { date: start },
    end: typeof end === 'string' && /T\d/.test(end)
      ? { dateTime: end, timeZone: 'Europe/Amsterdam' }
      : { date: end },
    attendees: (attendees || []).map((email) => ({ email })),
  };

  const { data } = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: eventBody,
    sendUpdates: 'all',
  });

  // Lokaal opslaan
  const ch = db.prepare('SELECT account_email FROM channels WHERE id = ?').get(channelId);
  try {
    const startISO = data.start?.dateTime || data.start?.date;
    const endISO = data.end?.dateTime || data.end?.date;
    const durationMin = startISO && endISO ? Math.round((new Date(endISO) - new Date(startISO)) / 60000) : null;
    db.prepare(`
      INSERT OR REPLACE INTO events (id, google_event_id, title, calendar_email, start_time, end_time, duration_minutes, location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuid(), data.id, data.summary, ch?.account_email, startISO, endISO, durationMin, data.location || null);
  } catch (e) {
    console.error('Failed to persist event locally:', e.message);
  }

  return {
    id: data.id,
    title: data.summary,
    start: data.start?.dateTime || data.start?.date,
    end: data.end?.dateTime || data.end?.date,
    html_link: data.htmlLink,
    calendar_email: ch?.account_email,
    channel_id: channelId,
  };
}
