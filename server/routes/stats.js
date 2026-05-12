import { Router } from 'express';
import db from '../db/init.js';

const router = Router();

router.get('/', (_req, res) => {
  const openCount = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'open'`).get().n;
  const snoozedCount = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'snoozed'`).get().n;
  const doneToday = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'done' AND date(done_at) = date('now')`).get().n;
  const urgentCount = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'open' AND priority = 'high'`).get().n;

  // Birthdays in komende 7 dagen
  const birthdaysContacts = db.prepare(`SELECT birthday FROM contacts WHERE birthday IS NOT NULL AND birthday != ''`).all();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const birthdaysWeek = birthdaysContacts.filter((c) => {
    const [, m, d] = c.birthday.split('-').map(Number);
    let next = new Date(now.getFullYear(), m - 1, d);
    if (next < today) next = new Date(now.getFullYear() + 1, m - 1, d);
    const daysUntil = Math.round((next - today) / 86400000);
    return daysUntil <= 7;
  }).length;

  // Nudges count
  const contactsWithLast = db.prepare(`
    SELECT c.id, COALESCE(n.remind_after_days, 14) AS remind_after_days,
      (SELECT MAX(received_at) FROM messages WHERE contact_id = c.id) AS last_message_at
    FROM contacts c
    LEFT JOIN nudge_settings n ON n.contact_id = c.id
    WHERE COALESCE(n.is_active, 1) = 1
  `).all();
  const nudgesCount = contactsWithLast.filter((c) => {
    if (!c.last_message_at) return false;
    const last = new Date(c.last_message_at).getTime();
    const days = Math.floor((Date.now() - last) / 86400000);
    return days >= c.remind_after_days;
  }).length;

  res.json({
    open_count: openCount,
    snoozed_count: snoozedCount,
    done_today: doneToday,
    urgent_count: urgentCount,
    birthdays_week: birthdaysWeek,
    nudges_count: nudgesCount,
  });
});

router.get('/daily-summary', (_req, res) => {
  const open = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'open'`).get().n;
  const urgent = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'open' AND priority = 'high'`).get().n;
  const wakingToday = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'snoozed' AND date(snoozed_until) = date('now')`).get().n;

  res.json({
    date: new Date().toISOString().slice(0, 10),
    open,
    urgent,
    waking_today: wakingToday,
  });
});

export default router;
