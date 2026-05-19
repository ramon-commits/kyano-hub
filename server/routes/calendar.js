import { Router } from 'express';
import { listAllEvents, createEvent } from '../services/calendar.js';

const router = Router();

router.get('/events', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const { events, errors } = await listAllEvents({ timeMin: from, timeMax: to });
    res.json({ events, errors });
  } catch (e) { next(e); }
});

router.get('/today', async (_req, res, next) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    const { events, errors } = await listAllEvents({ timeMin: start.toISOString(), timeMax: end.toISOString() });
    res.json({ events, errors });
  } catch (e) { next(e); }
});

router.post('/events', async (req, res, next) => {
  try {
    const { channel_id, title, start_time, end_time, duration_minutes, attendee_emails, attendee_email, description, location } = req.body || {};
    if (!channel_id || !title || !start_time) {
      return res.status(400).json({ error: 'channel_id, title, start_time zijn verplicht' });
    }

    let end = end_time;
    if (!end && duration_minutes) {
      end = new Date(new Date(start_time).getTime() + duration_minutes * 60000).toISOString();
    }
    if (!end) {
      end = new Date(new Date(start_time).getTime() + 30 * 60000).toISOString();
    }

    // Attendees normaliseren: array (nieuw) of single string (legacy) of niets.
    const rawAttendees = Array.isArray(attendee_emails)
      ? attendee_emails
      : attendee_email
        ? [attendee_email]
        : [];
    const attendees = rawAttendees
      .map((e) => (typeof e === 'string' ? e.trim() : ''))
      .filter((e) => e.includes('@'));

    const result = await createEvent({
      channelId: channel_id,
      title,
      start: start_time,
      end,
      attendees,
      description,
      location,
    });
    res.status(201).json(result);
  } catch (e) {
    const status = e?.message?.includes('not connected') ? 400 : 500;
    res.status(status).json({ error: e.message || 'Calendar create failed' });
  }
});

export default router;
