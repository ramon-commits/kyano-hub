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

export async function listEvents({ channelId, timeMin, timeMax, maxResults = 50 } = {}) {
  const calendar = gmailFor(channelId);
  const { data } = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin || new Date().toISOString(),
    timeMax: timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults,
  });

  const ch = db.prepare('SELECT account_email FROM channels WHERE id = ?').get(channelId);
  return (data.items || []).map((e) => ({
    id: e.id,
    title: e.summary || '(geen titel)',
    description: e.description || null,
    location: e.location || null,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    all_day: !!e.start?.date && !e.start?.dateTime,
    attendees: (e.attendees || []).map((a) => ({ email: a.email, displayName: a.displayName, responseStatus: a.responseStatus })),
    calendar_email: ch?.account_email || null,
    channel_id: channelId,
    html_link: e.htmlLink,
    status: e.status,
  }));
}

export async function listAllEvents({ timeMin, timeMax } = {}) {
  const channels = getConnectedEmailChannels();
  const all = [];
  for (const ch of channels) {
    try {
      const events = await listEvents({ channelId: ch.id, timeMin, timeMax });
      all.push(...events);
    } catch (e) {
      console.error(`Calendar list failed for ${ch.id}: ${e.message}`);
    }
  }
  all.sort((a, b) => new Date(a.start) - new Date(b.start));
  return all;
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
