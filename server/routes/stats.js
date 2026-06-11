import { Router } from 'express';
import db from '../db/init.js';

const router = Router();

// Server-side cache (30s): de stats-badges veranderen traag en meerdere tabs/clients
// vragen ze tegelijk op. Mutaties (done/snooze/…) invalidaten client-side; de cache
// kan daardoor max 30s achterlopen op een net-afgehandeld bericht — acceptabel voor badges.
let statsCache = null;
let statsCacheTime = 0;
const STATS_CACHE_MS = 30000;

router.get('/', (_req, res) => {
  const nowMs = Date.now();
  if (statsCache && (nowMs - statsCacheTime) < STATS_CACHE_MS) {
    return res.json(statsCache);
  }

  // open_count en urgent_count tellen unieke CONVERSATIES (threads), niet losse berichten
  const openCount = db.prepare(`
    SELECT COUNT(DISTINCT COALESCE(thread_id, id)) AS n FROM messages WHERE status = 'open'
  `).get().n;
  const snoozedCount = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'snoozed'`).get().n;
  const doneToday = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'done' AND date(done_at) = date('now')`).get().n;
  const urgentCount = db.prepare(`
    SELECT COUNT(DISTINCT COALESCE(thread_id, id)) AS n FROM messages WHERE status = 'open' AND priority = 'high'
  `).get().n;

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

  // Nudges count — 1 query met GROUP BY i.p.v. een correlated subquery per contact
  // (die voerde MAX(received_at) duizenden keren los uit en blokkeerde SQLite).
  const nudgesCount = db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT c.id
      FROM contacts c
      LEFT JOIN nudge_settings ns ON ns.contact_id = c.id
      LEFT JOIN messages m ON m.contact_id = c.id
      WHERE COALESCE(ns.is_active, 1) = 1
      GROUP BY c.id
      HAVING MAX(m.received_at) IS NOT NULL
        AND CAST((julianday('now') - julianday(MAX(m.received_at))) AS INTEGER) >= COALESCE(ns.remind_after_days, 14)
    )
  `).get().n;

  const result = {
    open_count: openCount,
    snoozed_count: snoozedCount,
    done_today: doneToday,
    urgent_count: urgentCount,
    birthdays_week: birthdaysWeek,
    nudges_count: nudgesCount,
  };
  statsCache = result;
  statsCacheTime = nowMs;
  res.json(result);
});

router.get('/daily-summary', (_req, res) => {
  const open = db.prepare(`
    SELECT COUNT(DISTINCT COALESCE(thread_id, id)) AS n FROM messages WHERE status = 'open'
  `).get().n;
  const urgent = db.prepare(`
    SELECT COUNT(DISTINCT COALESCE(thread_id, id)) AS n FROM messages WHERE status = 'open' AND priority = 'high'
  `).get().n;
  const wakingToday = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'snoozed' AND date(snoozed_until) = date('now')`).get().n;
  const doneYesterday = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'done' AND date(done_at) = date('now','-1 day')`).get().n;

  // Birthdays today + within 7 days
  const allWithBirthday = db.prepare(`SELECT id, name, company, birthday, avatar_initials, avatar_color FROM contacts WHERE birthday IS NOT NULL AND birthday != ''`).all();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const computed = allWithBirthday.map((c) => {
    const [, m, d] = c.birthday.split('-').map(Number);
    let next = new Date(now.getFullYear(), m - 1, d);
    if (next < today) next = new Date(now.getFullYear() + 1, m - 1, d);
    return { ...c, days_until: Math.round((next - today) / 86400000) };
  });
  const birthdaysToday = computed.filter((c) => c.days_until === 0);
  const birthdaysWeek = computed.filter((c) => c.days_until > 0 && c.days_until <= 7).sort((a, b) => a.days_until - b.days_until);

  // Top-3 nudges (langst niet gesproken, default threshold 14) — filtering/sortering
  // gebeurt nu volledig in SQL (GROUP BY/HAVING/ORDER BY) i.p.v. een correlated subquery.
  const nudges = db.prepare(`
    SELECT c.id, c.name, c.company, c.avatar_initials, c.avatar_color,
      COALESCE(ns.remind_after_days, 14) AS remind_after_days,
      MAX(m.received_at) AS last_message_at,
      CAST((julianday('now') - julianday(MAX(m.received_at))) AS INTEGER) AS days_since
    FROM contacts c
    LEFT JOIN nudge_settings ns ON ns.contact_id = c.id
    LEFT JOIN messages m ON m.contact_id = c.id
    WHERE COALESCE(ns.is_active, 1) = 1
    GROUP BY c.id
    HAVING last_message_at IS NOT NULL
      AND days_since >= COALESCE(ns.remind_after_days, 14)
    ORDER BY days_since DESC
    LIMIT 3
  `).all();

  res.json({
    date: today.toISOString().slice(0, 10),
    open_count: open,
    urgent_count: urgent,
    snoozed_waking_today: wakingToday,
    done_yesterday: doneYesterday,
    birthdays_today: birthdaysToday,
    birthdays_week: birthdaysWeek,
    nudges_top3: nudges,
  });
});

export default router;
