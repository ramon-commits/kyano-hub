import { Router, text } from 'express';
import db from '../db/init.js';
import { v4 as uuid } from 'uuid';
import { matchContact, mergeContacts, initialsFor } from '../services/contact-matcher.js';

const router = Router();

const AVATAR_COLORS = ['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#6366f1', '#8b5cf6', '#dc2626'];
function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

// Unescape ICS text-value: \\n \\, \\; \\\\ → actual characters
function icsUnescape(s) {
  if (!s) return s;
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

// Fold ICS lines per RFC 5545 (CRLF + space/tab = continuation)
function unfoldIcs(raw) {
  return raw.replace(/\r?\n[ \t]/g, '');
}

// Extract a value from a property line; tolerates parameters like ;VALUE=DATE
function extractIcsProp(block, prop) {
  const re = new RegExp(`^${prop}(?:;[^:\\r\\n]*)?:(.*)$`, 'mi');
  const m = block.match(re);
  return m ? icsUnescape(m[1]).trim() : null;
}

// Strip common Facebook birthday wrappers around a name
function cleanBirthdayName(raw) {
  if (!raw) return null;
  let s = raw.trim();
  // Leading cake / party emojis
  s = s.replace(/^(?:🎂|🎉|🎈|🎁)\s*/u, '');
  // "Verjaardag van X" / "Verjaardag: X"
  let m = s.match(/^(?:verjaardag(?:\s+van)?[:\s]+)(.+)$/i);
  if (m) s = m[1];
  // "X's birthday" / "X's verjaardag" / "X' birthday" (apostrophe of any flavor)
  m = s.match(/^(.+?)['’`]s\s+(?:birthday|verjaardag)$/i);
  if (m) s = m[1];
  // "X's b-day"
  m = s.match(/^(.+?)['’`]s\s+b-?day$/i);
  if (m) s = m[1];
  // Plural Dutch: "Verjaardagen" header — skip
  if (/^verjaardagen?$/i.test(s.trim())) return null;
  return s.trim() || null;
}

// Parse a DTSTART value: "20251225", "20251225T000000Z", "2025-12-25"
function parseDtStartToMonthDay(value) {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  const mi = parseInt(m, 10);
  const di = parseInt(d, 10);
  if (!mi || !di || mi < 1 || mi > 12 || di < 1 || di > 31) return null;
  return { month: m, day: d };
}

// GET /api/contacts
router.get('/', (req, res) => {
  const { search, sort, filter } = req.query;

  const where = [];
  const params = {};

  if (search) {
    where.push('(c.name LIKE @search OR c.company LIKE @search OR c.email LIKE @search OR c.phone LIKE @search)');
    params.search = `%${search}%`;
  }

  if (filter === 'has_open') {
    where.push(`EXISTS (SELECT 1 FROM messages WHERE contact_id = c.id AND status = 'open')`);
  } else if (filter === 'no_contact_14d') {
    where.push(`NOT EXISTS (
      SELECT 1 FROM messages WHERE contact_id = c.id AND received_at > datetime('now','-14 days')
    )`);
  } else if (['lead', 'klant', 'partner', 'leverancier', 'vriend', 'overig'].includes(filter)) {
    where.push('c.contact_status = @status');
    params.status = filter;
  }

  let orderBy = 'c.name ASC';
  if (sort === 'last_contact') orderBy = 'last_message_at DESC NULLS LAST';
  else if (sort === 'messages') orderBy = 'message_count DESC';
  else if (sort === 'deal_value') orderBy = 'c.deal_value DESC NULLS LAST';

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sql = `
    SELECT
      c.*,
      (SELECT COUNT(*) FROM messages WHERE contact_id = c.id) AS message_count,
      (SELECT COUNT(*) FROM messages WHERE contact_id = c.id AND status = 'open') AS open_count,
      (SELECT MAX(received_at) FROM messages WHERE contact_id = c.id) AS last_message_at
    FROM contacts c
    ${whereSql}
    ORDER BY ${orderBy}
  `;

  const rows = db.prepare(sql).all(params);
  res.json({ contacts: rows, total: rows.length });
});

// GET /api/contacts/birthdays?within_days=30
router.get('/birthdays', (req, res) => {
  const within = parseInt(req.query.within_days) || 30;
  const all = db.prepare(`SELECT * FROM contacts WHERE birthday IS NOT NULL AND birthday != ''`).all();

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const upcoming = all.map((c) => {
    const [, m, d] = c.birthday.split('-').map(Number);
    let next = new Date(now.getFullYear(), m - 1, d);
    if (next < today) next = new Date(now.getFullYear() + 1, m - 1, d);
    const daysUntil = Math.round((next - today) / 86400000);
    return { ...c, days_until: daysUntil, next_birthday: next.toISOString().slice(0, 10) };
  }).filter((c) => c.days_until <= within)
    .sort((a, b) => a.days_until - b.days_until);

  res.json({ birthdays: upcoming });
});

// GET /api/contacts/nudges?min_days=N (override per-contact threshold)
router.get('/nudges', (req, res) => {
  const override = req.query.min_days != null ? Math.max(0, parseInt(req.query.min_days)) : null;
  const rows = db.prepare(`
    SELECT
      c.*,
      COALESCE(n.remind_after_days, 14) AS remind_after_days,
      (SELECT MAX(received_at) FROM messages WHERE contact_id = c.id) AS last_message_at
    FROM contacts c
    LEFT JOIN nudge_settings n ON n.contact_id = c.id
    WHERE COALESCE(n.is_active, 1) = 1
  `).all();

  const now = Date.now();
  const due = rows.map((c) => {
    if (!c.last_message_at) return { ...c, days_since_last: null };
    const last = new Date(c.last_message_at).getTime();
    return { ...c, days_since_last: Math.floor((now - last) / 86400000) };
  }).filter((c) => {
    if (c.days_since_last == null) return false;
    const threshold = override != null ? override : c.remind_after_days;
    return c.days_since_last >= threshold;
  }).sort((a, b) => b.days_since_last - a.days_since_last);

  res.json({ nudges: due, threshold_override: override });
});

// GET /api/contacts/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT
      c.*,
      (SELECT COUNT(*) FROM messages WHERE contact_id = c.id) AS message_count,
      (SELECT COUNT(*) FROM messages WHERE contact_id = c.id AND status = 'open') AS open_count,
      (SELECT MAX(received_at) FROM messages WHERE contact_id = c.id) AS last_message_at
    FROM contacts c WHERE c.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Contact not found' });
  res.json(row);
});

// GET /api/contacts/:id/messages
router.get('/:id/messages', (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, ch.type AS channel_type, ch.label AS channel_label
    FROM messages m
    LEFT JOIN channels ch ON ch.id = m.channel_id
    WHERE m.contact_id = ?
    ORDER BY m.received_at DESC
    LIMIT 200
  `).all(req.params.id);
  res.json({ messages: rows });
});

// POST /api/contacts
router.post('/', (req, res) => {
  const { name, company, email, phone, birthday, notes, tags, avatar_color } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = uuid();
  db.prepare(`
    INSERT INTO contacts (id, name, company, email, phone, birthday, notes, tags, avatar_initials, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, company || null, email || null, phone || null, birthday || null, notes || null, tags || null, initialsFor(name), avatar_color || '#3b82f6');

  res.status(201).json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(id));
});

// PATCH /api/contacts/:id
router.patch('/:id', (req, res) => {
  const allowed = ['name', 'company', 'email', 'phone', 'birthday', 'notes', 'tags', 'avatar_color', 'avatar_initials', 'contact_status', 'deal_value', 'next_action', 'next_action_date'];
  const sets = [];
  const params = { id: req.params.id };
  for (const k of allowed) {
    if (k in req.body) {
      sets.push(`${k} = @${k}`);
      params[k] = req.body[k];
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'no valid fields' });
  sets.push(`updated_at = datetime('now')`);

  const result = db.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (result.changes === 0) return res.status(404).json({ error: 'Contact not found' });
  res.json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id));
});

// PATCH /api/contacts/:id/nudge-settings
router.patch('/:id/nudge-settings', (req, res) => {
  const exists = db.prepare('SELECT 1 FROM contacts WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Contact not found' });
  const { remind_after_days, is_active } = req.body || {};
  db.prepare(`
    INSERT INTO nudge_settings (contact_id, remind_after_days, is_active)
    VALUES (@contact_id, @remind_after_days, @is_active)
    ON CONFLICT(contact_id) DO UPDATE SET
      remind_after_days = COALESCE(excluded.remind_after_days, nudge_settings.remind_after_days),
      is_active = COALESCE(excluded.is_active, nudge_settings.is_active)
  `).run({
    contact_id: req.params.id,
    remind_after_days: Number.isInteger(remind_after_days) ? remind_after_days : null,
    is_active: typeof is_active === 'boolean' ? (is_active ? 1 : 0) : null,
  });
  const updated = db.prepare('SELECT * FROM nudge_settings WHERE contact_id = ?').get(req.params.id);
  res.json({ ok: true, settings: updated });
});

// POST /api/contacts/merge
router.post('/merge', (req, res) => {
  const { keep_id, merge_id } = req.body;
  if (!keep_id || !merge_id) return res.status(400).json({ error: 'keep_id and merge_id required' });
  const result = mergeContacts(keep_id, merge_id);
  res.json(result);
});

// POST /api/contacts/import-birthdays — accepts raw ICS text (Facebook export)
router.post(
  '/import-birthdays',
  text({ type: '*/*', limit: '10mb' }),
  (req, res) => {
    const body = typeof req.body === 'string' ? req.body : '';
    if (!body || !body.includes('BEGIN:VEVENT')) {
      return res.status(400).json({ error: 'Geen geldig .ics bestand (geen VEVENT blokken)' });
    }

    const unfolded = unfoldIcs(body);
    const parts = unfolded.split(/BEGIN:VEVENT/i).slice(1);

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const total = parts.length;

    const findContact = db.prepare('SELECT * FROM contacts WHERE lower(name) = lower(?)');
    const updateBirthday = db.prepare(
      "UPDATE contacts SET birthday = ?, updated_at = datetime('now') WHERE id = ?",
    );
    const insertContact = db.prepare(`
      INSERT INTO contacts (id, name, birthday, avatar_initials, avatar_color)
      VALUES (?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      for (const raw of parts) {
        const block = raw.split(/END:VEVENT/i)[0] || '';
        const summary = extractIcsProp(block, 'SUMMARY');
        const dtstart = extractIcsProp(block, 'DTSTART');
        const name = cleanBirthdayName(summary);
        const md = parseDtStartToMonthDay(dtstart);
        if (!name || !md) { skipped += 1; continue; }
        const birthday = `1990-${md.month}-${md.day}`;

        const existing = findContact.get(name);
        if (existing) {
          if (existing.birthday) { skipped += 1; continue; }
          updateBirthday.run(birthday, existing.id);
          updated += 1;
        } else {
          insertContact.run(uuid(), name, birthday, initialsFor(name), randomColor());
          imported += 1;
        }
      }
    });

    try {
      tx();
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Import mislukt' });
    }

    res.json({ ok: true, imported, updated, skipped, total });
  },
);

// POST /api/contacts/import
router.post('/import', (req, res) => {
  const items = Array.isArray(req.body) ? req.body : req.body.contacts;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'array of contacts required' });

  const inserted = [];
  for (const item of items) {
    if (!item.name) continue;
    const matched = matchContact({ email: item.email, name: item.name, phone: item.phone });
    inserted.push(matched);
  }
  res.json({ ok: true, count: inserted.length, contacts: inserted });
});

export default router;
