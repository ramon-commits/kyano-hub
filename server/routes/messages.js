import { Router } from 'express';
import multer from 'multer';
import { google } from 'googleapis';
import db from '../db/init.js';
import { v4 as uuid } from 'uuid';
import { sendReply, sendNew } from '../services/gmail-send.js';
import { markAsReadInGmail, markAsSpamInGmail, archiveInGmail } from '../services/gmail-labels.js';
import { getClient } from '../services/gmail-oauth.js';
import { matchContact } from '../services/contact-matcher.js';
import * as unipile from '../services/unipile.js';
import { completeAsanaTasksForMessages } from '../services/asana-sync.js';

const router = Router();

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

// Voor email-bijlagen (reply / forward / compose) — tot 10 bestanden, 10MB elk.
// multer laat JSON-requests ongemoeid: bij een niet-multipart body roept .array() gewoon next() aan.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

// Normaliseer geüploade multer-bestanden naar het attachment-formaat dat gmail-send verwacht.
function filesToAttachments(files) {
  return (files || []).map((f) => ({
    content: f.buffer,
    filename: f.originalname,
    mimeType: f.mimetype,
    size: f.size,
  }));
}

function kindForMime(mime, filename) {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (filename && /\.(jpe?g|png|gif|webp)$/i.test(filename)) return 'image';
  if (filename && /\.(mp4|mov|webm)$/i.test(filename)) return 'video';
  if (filename && /\.(mp3|m4a|ogg|wav)$/i.test(filename)) return 'audio';
  return 'file';
}

const MESSAGE_SELECT = `
  SELECT
    m.*,
    c.name AS contact_name,
    c.company AS contact_company,
    c.email AS contact_email,
    c.phone AS contact_phone,
    c.avatar_initials AS contact_initials,
    c.avatar_color AS contact_color,
    ch.type AS channel_type,
    ch.label AS channel_label,
    ch.account_email AS channel_account
  FROM messages m
  LEFT JOIN contacts c ON c.id = m.contact_id
  LEFT JOIN channels ch ON ch.id = m.channel_id
`;

// Lijst-view select: identiek aan MESSAGE_SELECT maar ZONDER body_html/body_text.
// Die velden zijn alleen nodig bij het OPENEN van een bericht (GET /:id en /:id/thread),
// niet in de inbox-lijst. Weglaten verkleint de response enorm (~969KB → ~50KB voor 50 rijen).
const LIST_SELECT = `
  SELECT
    m.id, m.external_id, m.channel_id, m.contact_id, m.direction, m.subject, m.snippet,
    m.status, m.priority, m.received_at, m.thread_id, m.snoozed_until, m.deep_link,
    m.done_at, m.done_note, m.done_category, m.attachments_json,
    m.asana_contact_email, m.asana_contact_phone,
    c.name AS contact_name,
    c.company AS contact_company,
    c.email AS contact_email,
    c.phone AS contact_phone,
    c.avatar_initials AS contact_initials,
    c.avatar_color AS contact_color,
    ch.type AS channel_type,
    ch.label AS channel_label,
    ch.account_email AS channel_account
  FROM messages m
  LEFT JOIN contacts c ON c.id = m.contact_id
  LEFT JOIN channels ch ON ch.id = m.channel_id
`;

// GET /api/messages
// Voor status='open' groeperen we per thread: 1 rij per conversatie met message_count.
// Voor andere statussen (done/snoozed/etc) blijven we per-message tonen (logboek detail).
router.get('/', (req, res) => {
  const { status, channel_type, channel_id, contact_id, search, priority } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  const groupByThread = status === 'open';

  // ===== Gegroepeerd: 1 rij per thread (inbox-view) =====
  if (groupByThread) {
    const where = ["m.status = 'open'"];
    const params = {};
    if (channel_type) { where.push('ch.type = @channel_type'); params.channel_type = channel_type; }
    if (channel_id) { where.push('m.channel_id = @channel_id'); params.channel_id = channel_id; }
    if (contact_id) { where.push('m.contact_id = @contact_id'); params.contact_id = contact_id; }
    if (priority) { where.push('m.priority = @priority'); params.priority = priority; }
    if (search) {
      where.push(`(m.snippet LIKE @search OR m.subject LIKE @search OR c.name LIKE @search OR m.done_note LIKE @search OR m.body_text LIKE @search)`);
      params.search = `%${search}%`;
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    // Stap 1 — vind voor elke thread de id van het laatste OPEN bericht (matched ook contact/channel filters)
    // We tellen tegelijk hoeveel open berichten er in die thread zitten.
    // De outer SELECT moet ORDER BY received_at DESC hebben — anders komt rows in SQLite-storage-order
    // (effectief UUID) terug en kan een latere `.slice(0,50)` complete kanalen overslaan op pagina 1.
    const latestSql = `
      SELECT
        m.id AS latest_id,
        m.received_at AS latest_received_at,
        m.priority AS latest_priority,
        COALESCE(m.thread_id, m.id) AS thread_key,
        COUNT(*) OVER (PARTITION BY COALESCE(m.thread_id, m.id)) AS thread_open_count,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(m.thread_id, m.id)
          ORDER BY m.received_at DESC
        ) AS rn
      FROM messages m
      LEFT JOIN contacts c ON c.id = m.contact_id
      LEFT JOIN channels ch ON ch.id = m.channel_id
      ${whereSql}
    `;
    // Urgente berichten (priority 'high', incl. urgente to-do's) bovenaan, daarna op datum.
    const latestRows = db.prepare(`
      SELECT latest_id, thread_key, thread_open_count
      FROM (${latestSql})
      WHERE rn = 1
      ORDER BY (latest_priority = 'high') DESC, latest_received_at DESC
    `).all(params);

    const total = latestRows.length;
    const pageRowsMeta = latestRows.slice(offset, offset + limit);

    if (pageRowsMeta.length === 0) {
      return res.json({ messages: [], total, limit, offset });
    }

    // Stap 2 — haal full message rows op voor deze laatste-ids
    const placeholders = pageRowsMeta.map((_, i) => `@id${i}`).join(', ');
    const idParams = Object.fromEntries(pageRowsMeta.map((r, i) => [`id${i}`, r.latest_id]));
    const fullRows = db.prepare(`${LIST_SELECT} WHERE m.id IN (${placeholders})`).all(idParams);

    // Stap 3 — koppel thread_open_count en sorteer op received_at desc
    const countByLatest = new Map(pageRowsMeta.map((r) => [r.latest_id, r.thread_open_count]));
    const enriched = fullRows
      .map((r) => ({ ...r, message_count: countByLatest.get(r.id) || 1 }))
      .sort((a, b) => {
        const ap = a.priority === 'high' ? 1 : 0;
        const bp = b.priority === 'high' ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return new Date(b.received_at) - new Date(a.received_at);
      });

    return res.json({ messages: enriched, total, limit, offset });
  }

  // ===== Per-message (done/snoozed/archived/logboek) =====
  const where = [];
  const params = {};

  if (status) {
    if (status.includes(',')) {
      const list = status.split(',').map((s, i) => {
        params[`status${i}`] = s.trim();
        return `@status${i}`;
      }).join(',');
      where.push(`m.status IN (${list})`);
    } else {
      where.push('m.status = @status');
      params.status = status;
    }
  }
  if (channel_type) { where.push('ch.type = @channel_type'); params.channel_type = channel_type; }
  if (channel_id) { where.push('m.channel_id = @channel_id'); params.channel_id = channel_id; }
  if (contact_id) { where.push('m.contact_id = @contact_id'); params.contact_id = contact_id; }
  if (priority) { where.push('m.priority = @priority'); params.priority = priority; }

  if (search) {
    const useFts = (status === 'done');
    if (useFts) {
      const cleaned = String(search).replace(/[^\p{L}\p{N}\s@._-]/gu, ' ').trim();
      if (cleaned.length >= 2) {
        const ftsQuery = `"${cleaned.replace(/"/g, '""')}"*`;
        where.push('m.rowid IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH @ftsQuery)');
        params.ftsQuery = ftsQuery;
      } else {
        where.push(`(m.snippet LIKE @search OR m.subject LIKE @search OR c.name LIKE @search OR m.done_note LIKE @search)`);
        params.search = `%${search}%`;
      }
    } else {
      where.push(`(m.snippet LIKE @search OR m.subject LIKE @search OR c.name LIKE @search OR m.done_note LIKE @search OR m.body_text LIKE @search)`);
      params.search = `%${search}%`;
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `${LIST_SELECT} ${whereSql} ORDER BY m.received_at DESC LIMIT @limit OFFSET @offset`;

  params.limit = limit;
  params.offset = offset;

  const rows = db.prepare(sql).all(params);

  const countSql = `SELECT COUNT(*) AS n FROM messages m LEFT JOIN contacts c ON c.id = m.contact_id LEFT JOIN channels ch ON ch.id = m.channel_id ${whereSql}`;
  const { limit: _l, offset: _o, ...countParams } = params;
  const total = db.prepare(countSql).get(countParams).n;

  res.json({ messages: rows, total, limit, offset });
});

// GET /api/messages/next-in-inbox
// Bepaalt het volgende bericht voor de triage-flow. De database is altijd up-to-date;
// dit voorkomt de timing-bug waar advanceSelection op een stale frontend-lijst draait
// nadat de inbox query is afgekoppeld (InboxView is unmounted tijdens ConversationView).
//
// Query params:
//   - exclude: comma-separated message-IDs die de frontend recent heeft afgehandeld
//     (skip-list voor race condities tussen mutation-commit en deze call)
//   - exclude_threads: comma-separated thread_keys (thread_id of msg_id voor threadloze).
//     Sluit hele threads uit — handig om niet steeds bij dezelfde gesprek te blijven hangen.
// Response: { next_id: string|null, remaining: number }
router.get('/next-in-inbox', (req, res) => {
  const excludeIds = String(req.query.exclude || '').split(',').map((s) => s.trim()).filter(Boolean);
  const excludeThreadKeys = String(req.query.exclude_threads || '').split(',').map((s) => s.trim()).filter(Boolean);

  const params = {};
  const conds = ["m.status = 'open'"];
  if (excludeIds.length) {
    const ph = excludeIds.map((_, i) => `@ex${i}`).join(',');
    conds.push(`m.id NOT IN (${ph})`);
    excludeIds.forEach((id, i) => { params[`ex${i}`] = id; });
  }
  if (excludeThreadKeys.length) {
    const ph = excludeThreadKeys.map((_, i) => `@tk${i}`).join(',');
    conds.push(`COALESCE(m.thread_id, m.id) NOT IN (${ph})`);
    excludeThreadKeys.forEach((tk, i) => { params[`tk${i}`] = tk; });
  }
  const where = `WHERE ${conds.join(' AND ')}`;

  const latestSql = `
    SELECT
      m.id AS latest_id,
      m.received_at AS latest_received_at,
      COALESCE(m.thread_id, m.id) AS thread_key,
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(m.thread_id, m.id)
        ORDER BY m.received_at DESC
      ) AS rn
    FROM messages m
    ${where}
  `;
  const rows = db.prepare(`
    SELECT latest_id, thread_key
    FROM (${latestSql})
    WHERE rn = 1
    ORDER BY latest_received_at DESC
    LIMIT 1
  `).all(params);

  const remaining = db.prepare(`
    SELECT COUNT(DISTINCT COALESCE(thread_id, id)) AS c
    FROM messages WHERE status = 'open'
  `).get().c;

  res.json({ next_id: rows[0]?.latest_id || null, remaining });
});

// GET /api/messages/pinned — vastgezette gesprekken (1 row per thread, met laatste bericht)
router.get('/pinned', (req, res) => {
  const rows = db.prepare(`
    SELECT
      m.*,
      c.name AS contact_name,
      c.company AS contact_company,
      c.email AS contact_email,
      c.phone AS contact_phone,
      c.avatar_initials AS contact_initials,
      c.avatar_color AS contact_color,
      ch.type AS channel_type,
      ch.label AS channel_label,
      ch.account_email AS channel_account,
      p.pinned_at
    FROM pinned_threads p
    JOIN messages m ON m.id = (
      SELECT id FROM messages
      WHERE thread_id = p.thread_id
      ORDER BY received_at DESC
      LIMIT 1
    )
    LEFT JOIN contacts c ON c.id = m.contact_id
    LEFT JOIN channels ch ON ch.id = m.channel_id
    ORDER BY p.pinned_at DESC
    LIMIT 10
  `).all();
  res.json({ messages: rows, total: rows.length });
});

// POST /api/messages/:id/pin — pin de thread van dit bericht
router.post('/:id/pin', (req, res) => {
  const m = db.prepare('SELECT thread_id, channel_id, contact_id FROM messages WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Message not found' });
  if (!m.thread_id) return res.status(400).json({ error: 'Message has no thread_id (cannot pin)' });

  db.prepare(`
    INSERT INTO pinned_threads (thread_id, channel_id, contact_id) VALUES (?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET pinned_at = datetime('now')
  `).run(m.thread_id, m.channel_id, m.contact_id);
  res.json({ ok: true, thread_id: m.thread_id, pinned: true });
});

// DELETE /api/messages/:id/pin — unpin de thread van dit bericht
router.delete('/:id/pin', (req, res) => {
  const m = db.prepare('SELECT thread_id FROM messages WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Message not found' });
  const r = db.prepare('DELETE FROM pinned_threads WHERE thread_id = ?').run(m.thread_id);
  res.json({ ok: true, thread_id: m.thread_id, removed: r.changes });
});

// POST /api/messages/:id/mark-read — markeer extern als gelezen (Gmail label + Unipile chat)
router.post('/:id/mark-read', (req, res) => {
  const msg = db.prepare('SELECT id FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  markExternalRead(req.params.id);
  res.json({ ok: true });
});

// POST /api/messages/:id/report-spam — markeer email als spam bij Gmail + lokaal archiveren + blokkeren
router.post('/:id/report-spam', async (req, res) => {
  const msg = db.prepare(`
    SELECT m.id, m.external_id, m.channel_id, m.contact_id, m.thread_id,
           ch.type AS channel_type
    FROM messages m
    LEFT JOIN channels ch ON ch.id = m.channel_id
    WHERE m.id = ?
  `).get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (msg.channel_type !== 'email') {
    return res.status(400).json({ error: 'Spam melden alleen voor email' });
  }

  let gmailOk = false;
  if (msg.external_id && msg.channel_id) {
    const r = await markAsSpamInGmail(msg.channel_id, msg.external_id);
    gmailOk = !!r?.ok;
  }

  // Archiveer alle open berichten in de thread lokaal
  const threadIds = openIdsInThread(req.params.id);
  const archiveStmt = db.prepare(`UPDATE messages SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND status = 'open'`);
  let archived = 0;
  const tx = db.transaction(() => {
    for (const id of threadIds) archived += archiveStmt.run(id).changes;
  });
  tx();
  for (const id of threadIds) logInteraction(id, 'archived', 'Gemeld als spam');

  // Auto-blokkeer: gebruik patroon uit body of contact email
  let pattern = (req.body?.email_pattern || '').toString().trim();
  if (!pattern && msg.contact_id) {
    const c = db.prepare('SELECT email FROM contacts WHERE id = ?').get(msg.contact_id);
    if (c?.email) pattern = c.email;
  }
  if (pattern) {
    const lower = pattern.toLowerCase();
    const existing = db.prepare(`SELECT id FROM sender_rules WHERE lower(email_pattern) = ? AND rule = 'block'`).get(lower);
    if (!existing) {
      db.prepare(`INSERT INTO sender_rules (id, email_pattern, rule) VALUES (?, ?, 'block')`)
        .run(uuid(), lower);
    }
  }

  res.json({ ok: true, gmail_ok: gmailOk, archived, blocked_pattern: pattern || null });
});

// POST /api/messages/:id/spam-and-block — Gmail spam + blokkeer afzender + archiveer ál zijn berichten
// Combineert de drie acties in één call en geeft het volgende open bericht terug (server-side advance).
router.post('/:id/spam-and-block', async (req, res) => {
  const msg = db.prepare(`
    SELECT m.id, m.external_id, m.channel_id, m.contact_id,
           c.email AS contact_email, ch.type AS channel_type
    FROM messages m
    LEFT JOIN contacts c ON c.id = m.contact_id
    LEFT JOIN channels ch ON ch.id = m.channel_id
    WHERE m.id = ?
  `).get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  // 1. Markeer als spam in Gmail (alleen email)
  let gmailOk = false;
  if (msg.channel_type === 'email' && msg.external_id && msg.channel_id) {
    const r = await markAsSpamInGmail(msg.channel_id, msg.external_id);
    gmailOk = !!r?.ok;
  }

  // 2. Blokkeer afzender (sender_rules — zelfde conventie als /report-spam)
  let blockedPattern = null;
  if (msg.contact_email) {
    const lower = msg.contact_email.toLowerCase();
    const existing = db.prepare(`SELECT id FROM sender_rules WHERE lower(email_pattern) = ? AND rule = 'block'`).get(lower);
    if (!existing) {
      db.prepare(`INSERT INTO sender_rules (id, email_pattern, rule) VALUES (?, ?, 'block')`).run(uuid(), lower);
    }
    blockedPattern = lower;
  }

  // 3. Archiveer alle nog-zichtbare berichten van deze afzender.
  //    Bewaar de geraakte ids zodat de client een "ongedaan maken" kan aanbieden.
  const archivedRows = msg.contact_id
    ? db.prepare(`SELECT id FROM messages WHERE contact_id = ? AND status IN ('open', 'snoozed', 'waiting')`).all(msg.contact_id)
    : db.prepare(`SELECT id FROM messages WHERE id = ? AND status IN ('open', 'snoozed', 'waiting')`).all(msg.id);
  const archivedIds = archivedRows.map((r) => r.id);
  if (archivedIds.length) {
    const placeholders = archivedIds.map(() => '?').join(',');
    db.prepare(`UPDATE messages SET status = 'archived', updated_at = datetime('now') WHERE id IN (${placeholders})`).run(...archivedIds);
  }
  const archived = archivedIds.length;
  logInteraction(msg.id, 'archived', 'Spam + geblokkeerd');

  // 4. Volgende open bericht (urgent eerst, dan nieuwste)
  const next = db.prepare(`
    SELECT id FROM messages
    WHERE status = 'open' AND id != ?
    ORDER BY (priority = 'high') DESC, received_at DESC
    LIMIT 1
  `).get(msg.id);

  res.json({ ok: true, gmail_ok: gmailOk, archived, archived_ids: archivedIds, blocked_pattern: blockedPattern, next_id: next?.id || null });
});

// POST /api/messages/:id/create-todo — maak een to-do met de info van dit bericht als context.
// Het originele bericht blijft staan; de to-do is een losse open regel in het todo-1 kanaal.
router.post('/:id/create-todo', (req, res) => {
  const { title, description, due_date } = req.body || {};
  const msg = db.prepare(`
    SELECT m.subject, m.snippet, c.name AS contact_name
    FROM messages m LEFT JOIN contacts c ON c.id = m.contact_id
    WHERE m.id = ?
  `).get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  const todoTitle = (title && title.trim())
    || `Opvolgen: ${msg.contact_name || 'contact'} - ${msg.subject || (msg.snippet || '').slice(0, 50)}`;
  const todoDesc = (description && description.trim())
    || `Vanuit bericht: ${msg.subject || ''}\nVan: ${msg.contact_name || 'onbekend'}\n\n${msg.snippet || ''}`;

  // Vind of maak het "Ramon" contact (voor de avatar) — zelfde patroon als /todo
  let ramon = db.prepare("SELECT id FROM contacts WHERE email = 'ramon@endlessminds.nl'").get();
  if (!ramon) {
    ramon = { id: uuid() };
    db.prepare("INSERT INTO contacts (id, name, email, avatar_initials, avatar_color) VALUES (?, 'Ramon', 'ramon@endlessminds.nl', 'RB', '#3b82f6')").run(ramon.id);
  }

  // Deadline is puur informatief (in snippet + body), net als de /todo route.
  let snippetText = todoTitle;
  let bodyText = todoDesc;
  if (due_date) {
    const d = new Date(due_date);
    if (!isNaN(d.getTime())) {
      const label = d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
      snippetText = `${todoTitle} · Deadline: ${label}`;
      bodyText = `${bodyText}\n\nDeadline: ${label}`;
    }
  }

  const todoId = uuid();
  db.prepare(`
    INSERT INTO messages (id, channel_id, contact_id, direction, subject, snippet, body_text, status, priority, received_at, created_at, updated_at)
    VALUES (?, 'todo-1', ?, 'inbound', ?, ?, ?, 'open', 'medium', datetime('now'), datetime('now'), datetime('now'))
  `).run(todoId, ramon.id, todoTitle, snippetText, bodyText);

  res.json({ ok: true, todo_id: todoId, title: todoTitle });
});

// POST /api/messages/:id/schedule-follow-up — plan een automatische follow-up.
// Zet de thread op 'waiting' met een wektijd; de snooze-cron stelt na X dagen zónder
// reactie de follow-up klaar (AI of vooraf geschreven tekst).
router.post('/:id/schedule-follow-up', (req, res) => {
  const { days, mode, custom_text } = req.body || {};
  const numDays = Number(days);
  if (!numDays || numDays <= 0) return res.status(400).json({ error: 'days (>0) is verplicht' });
  if (!['ai', 'custom'].includes(mode)) return res.status(400).json({ error: "mode moet 'ai' of 'custom' zijn" });
  if (mode === 'custom' && !(custom_text && custom_text.trim())) {
    return res.status(400).json({ error: 'custom_text is verplicht bij mode=custom' });
  }

  const msg = db.prepare('SELECT id, thread_id FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  const followUpAt = new Date(Date.now() + numDays * 86400000).toISOString();
  const text = mode === 'custom' ? custom_text.trim() : null;

  const ids = openIdsInThread(req.params.id);
  const stmt = db.prepare(`
    UPDATE messages SET
      status = 'waiting',
      snoozed_until = ?,
      snoozed_at = datetime('now'),
      follow_up_mode = ?,
      follow_up_custom_text = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of ids) n += stmt.run(followUpAt, mode, text, id).changes;
    return n;
  });
  let changed = tx();
  if (changed === 0) {
    changed = stmt.run(followUpAt, mode, text, req.params.id).changes;
    if (changed === 0) return res.status(404).json({ error: 'Message not found' });
  }
  for (const id of ids) logInteraction(id, 'snoozed', `Follow-up gepland over ${numDays} dag(en)`);

  const next = db.prepare(`
    SELECT id FROM messages
    WHERE status = 'open' AND id != ?
    ORDER BY (priority = 'high') DESC, received_at DESC
    LIMIT 1
  `).get(msg.id);

  res.json({ ok: true, follow_up_at: followUpAt, next_id: next?.id || null });
});

// GET /api/messages/:id/thread-summary — basale samenvatting (zonder AI)
router.get('/:id/thread-summary', async (req, res) => {
  const msg = db.prepare('SELECT id, thread_id FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  const threadKey = msg.thread_id || msg.id;
  // Voor berichten zonder thread_id: alleen het bericht zelf
  const whereSql = msg.thread_id
    ? `WHERE m.thread_id = ?`
    : `WHERE m.id = ?`;
  const params = msg.thread_id ? [msg.thread_id] : [msg.id];

  const rows = db.prepare(`
    SELECT m.id, m.subject, m.snippet, m.body_text, m.received_at, m.direction,
           m.status, m.attachments_json,
           c.id AS contact_id, c.name AS contact_name,
           c.avatar_initials AS contact_initials, c.avatar_color AS contact_color,
           ch.type AS channel_type, ch.label AS channel_label, ch.account_email AS channel_account
    FROM messages m
    LEFT JOIN contacts c ON c.id = m.contact_id
    LEFT JOIN channels ch ON ch.id = m.channel_id
    ${whereSql}
    ORDER BY m.received_at ASC
  `).all(...params);

  // Deelnemers — gebruik contact-id om uniek te zijn, val terug op naam
  const seen = new Map();
  for (const r of rows) {
    if (r.direction === 'outbound') continue;
    const key = r.contact_id || r.contact_name || r.channel_account || 'unknown';
    if (!seen.has(key)) {
      seen.set(key, {
        id: r.contact_id || null,
        name: r.contact_name || r.channel_account || 'Onbekend',
        initials: r.contact_initials || null,
        color: r.contact_color || null,
      });
    }
  }
  const participants = [...seen.values()];

  let attachmentCount = 0;
  for (const r of rows) {
    if (!r.attachments_json) continue;
    try {
      const arr = JSON.parse(r.attachments_json);
      if (Array.isArray(arr)) {
        attachmentCount += arr.filter((a) => !a.isInline).length;
      }
    } catch { /* ignore */ }
  }

  const inboundCount = rows.filter((r) => r.direction === 'inbound').length;
  const outboundCount = rows.filter((r) => r.direction === 'outbound').length;
  const firstMsg = rows[0] || null;
  const lastMsg = rows[rows.length - 1] || null;
  const subject = rows.find((r) => r.subject)?.subject || null;

  // ===== AI samenvatting met 60-min cache =====
  let aiSummary = null;
  let aiCachedAt = null;
  const refresh = req.query.refresh === 'true';
  const isEmail = lastMsg?.channel_type === 'email';
  const canSummarize = !!process.env.ANTHROPIC_API_KEY && rows.length >= 2 && isEmail;

  if (canSummarize) {
    try {
      let cached = null;
      try {
        cached = db.prepare('SELECT summary, created_at FROM thread_summaries WHERE thread_key = ?').get(threadKey);
      } catch { /* tabel kan ontbreken op heel oude DB's */ }

      const cacheMinutes = cached?.created_at
        ? (Date.now() - new Date(cached.created_at.replace(' ', 'T') + 'Z').getTime()) / 60000
        : Infinity;

      if (cached?.summary && !refresh && cacheMinutes < 60) {
        aiSummary = cached.summary;
        aiCachedAt = cached.created_at;
      } else {
        const threadText = rows.map((r) => {
          const who = r.direction === 'outbound' ? 'Ramon' : (r.contact_name || 'Hen');
          const text = (r.body_text || r.snippet || '').slice(0, 400);
          return `[${who} — ${r.received_at}]: ${text}`;
        }).join('\n\n').slice(0, 3000);

        const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
        const prompt = `Analyseer deze email thread en geef een KORTE samenvatting.

THREAD:
${threadText}

Geef EXACT dit format terug, in dezelfde taal als de thread:

SAMENVATTING: [1-2 zinnen wat er aan de hand is]
STATUS: [wat is afgehandeld en wat nog open staat]
ACTIE: [wat moet Ramon doen — concreet en specifiek. Als niks: "Geen actie nodig"]

Wees KORT. Geen opsommingen. Gewone zinnen.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const data = await response.json();
        if (response.ok && data?.content?.[0]?.text) {
          aiSummary = data.content[0].text.trim();
          const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
          try {
            db.prepare(`
              INSERT INTO thread_summaries (thread_key, summary, tokens_used, created_at)
              VALUES (?, ?, ?, datetime('now'))
              ON CONFLICT(thread_key) DO UPDATE SET
                summary = excluded.summary,
                tokens_used = excluded.tokens_used,
                created_at = datetime('now')
            `).run(threadKey, aiSummary, tokens);
            aiCachedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
          } catch (e) { console.log('thread_summaries cache write failed:', e.message); }
        } else if (cached?.summary) {
          // API faalde — gebruik oude cache als die er is
          aiSummary = cached.summary;
          aiCachedAt = cached.created_at;
        }
      }
    } catch (e) {
      console.log('AI thread summary failed:', e.message);
    }
  }

  res.json({
    thread_key: threadKey,
    channel_type: lastMsg?.channel_type || null,
    channel_label: lastMsg?.channel_label || null,
    subject,
    participants,
    total_messages: rows.length,
    inbound_count: inboundCount,
    outbound_count: outboundCount,
    first_message_at: firstMsg?.received_at || null,
    last_message_at: lastMsg?.received_at || null,
    last_sender: lastMsg ? (lastMsg.direction === 'outbound' ? 'Jij' : lastMsg.contact_name || 'Onbekend') : null,
    last_snippet: lastMsg?.snippet ? lastMsg.snippet.slice(0, 200) : null,
    attachment_count: attachmentCount,
    has_attachments: attachmentCount > 0,
    ai_summary: aiSummary,
    ai_summary_cached_at: aiCachedAt,
  });
});

// GET /api/messages/:id/attachment/:attachmentId — proxy de bijlage via Gmail API
router.get('/:id/attachment/:attachmentId', async (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(msg.channel_id);
  if (!channel) return res.status(400).json({ error: 'Bericht heeft geen kanaal' });
  if (!msg.external_id) return res.status(400).json({ error: 'Bericht heeft geen external_id' });

  // Lees metadata uit attachments_json voor mime + filename (gedeeld door beide paden)
  let meta = null;
  try {
    const list = msg.attachments_json ? JSON.parse(msg.attachments_json) : [];
    meta = list.find((a) => a.id === req.params.attachmentId) || null;
  } catch { /* ignore */ }

  try {
    let buffer = null;
    let mimeType = null;
    let filename = (meta?.filename || meta?.file_name || 'attachment').replace(/[\r\n"]/g, '_');

    if (channel.type === 'email') {
      const client = getClient(msg.channel_id);
      if (!client) return res.status(400).json({ error: 'Email-kanaal niet verbonden' });

      const gmail = google.gmail({ version: 'v1', auth: client });
      const { data } = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: msg.external_id,
        id: req.params.attachmentId,
      });
      if (!data?.data) return res.status(404).json({ error: 'Bijlage niet gevonden bij Gmail' });

      buffer = Buffer.from(data.data, 'base64url');
      mimeType = meta?.mimeType || meta?.mime || 'application/octet-stream';
    } else if (['whatsapp', 'instagram', 'linkedin'].includes(channel.type)) {
      // Unipile: download de media binary via aparte endpoint
      const result = await unipile.getMessageAttachmentBinary(msg.external_id, req.params.attachmentId);
      if (!result) return res.status(404).json({ error: 'Bijlage niet gevonden bij Unipile' });
      buffer = result.buffer;
      mimeType = meta?.mime || meta?.mimeType || result.mimeType || 'application/octet-stream';
    } else {
      return res.status(400).json({ error: `Bijlages niet ondersteund voor kanaal-type ${channel.type}` });
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (e) {
    console.error('attachment fetch fail:', e.message);
    res.status(500).json({ error: e.message || 'Bijlage ophalen mislukt' });
  }
});

// GET /api/messages/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Message not found' });
  res.json(row);
});

// GET /api/messages/:id/thread — alle berichten in dezelfde thread (lokaal uit DB)
router.get('/:id/thread', (req, res) => {
  const m = db.prepare('SELECT thread_id FROM messages WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Message not found' });
  if (!m.thread_id) {
    const single = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(req.params.id);
    return res.json({ messages: [single], thread_id: null });
  }
  const messages = db.prepare(`${MESSAGE_SELECT} WHERE m.thread_id = ? ORDER BY m.received_at ASC`).all(m.thread_id);
  res.json({ messages, thread_id: m.thread_id });
});

// GET /api/messages/:id/thread-download?format=txt|html — download de hele thread als bestand
router.get('/:id/thread-download', (req, res) => {
  const format = req.query.format === 'html' ? 'html' : 'txt';
  const msg = db.prepare('SELECT id, thread_id FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Not found' });

  const threadKey = msg.thread_id || msg.id;
  const threadMsgs = db.prepare(`
    SELECT m.*, c.name AS contact_name, ch.label AS channel_label
    FROM messages m
    LEFT JOIN contacts c ON c.id = m.contact_id
    LEFT JOIN channels ch ON ch.id = m.channel_id
    WHERE COALESCE(m.thread_id, m.id) = ?
    ORDER BY m.received_at ASC
  `).all(threadKey);

  const subject = threadMsgs.find((m) => m.subject)?.subject || 'Geen onderwerp';
  const safeName = subject.replace(/[^a-zA-Z0-9 ]/g, '_').slice(0, 50).trim() || 'thread';
  const who = (m) => (m.direction === 'outbound' ? 'Ramon Brugman' : (m.contact_name || 'Onbekend'));
  const fmtDate = (m) => {
    const d = new Date(m.received_at);
    return isNaN(d.getTime()) ? (m.received_at || '') : d.toLocaleString('nl-NL');
  };

  if (format === 'txt') {
    const sep = '='.repeat(60);
    let text = `Thread: ${subject}\n${threadMsgs.length} bericht${threadMsgs.length === 1 ? '' : 'en'}\n${sep}\n\n`;
    for (const m of threadMsgs) {
      text += `Van: ${who(m)}\n`;
      text += `Datum: ${fmtDate(m)}\n`;
      if (m.subject) text += `Onderwerp: ${m.subject}\n`;
      text += `${'-'.repeat(40)}\n`;
      text += `${m.body_text || m.snippet || '(geen inhoud)'}\n\n`;
      text += `${sep}\n\n`;
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.txt"`);
    return res.send(text);
  }

  // format === 'html'
  let html = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><title>${escapeHtmlForForward(subject)}</title>
    <style>body{font-family:Arial,sans-serif;max-width:800px;margin:20px auto;color:#333;}
    .msg{margin:20px 0;padding:16px;border:1px solid #e5e7eb;border-radius:8px;}
    .msg.outbound{border-left:4px solid #3b82f6;background:#f8faff;}
    .msg.inbound{border-left:4px solid #e5e7eb;}
    .meta{font-size:12px;color:#888;margin-bottom:8px;}
    h1{font-size:18px;}</style></head><body>`;
  html += `<h1>${escapeHtmlForForward(subject)}</h1><p style="color:#888;">${threadMsgs.length} bericht${threadMsgs.length === 1 ? '' : 'en'}</p><hr>`;
  for (const m of threadMsgs) {
    const cls = m.direction === 'outbound' ? 'outbound' : 'inbound';
    html += `<div class="msg ${cls}">`;
    html += `<div class="meta"><b>${escapeHtmlForForward(who(m))}</b> — ${escapeHtmlForForward(fmtDate(m))}</div>`;
    html += m.body_html || `<p>${escapeHtmlForForward(m.body_text || m.snippet || '').replace(/\n/g, '<br>')}</p>`;
    html += `</div>`;
  }
  html += `</body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.html"`);
  return res.send(html);
});

// POST /api/messages/:id/reply — verstuur een reply via Gmail API
router.post('/:id/reply', upload.array('files', 10), async (req, res, next) => {
  try {
    const original = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(req.params.id);
    if (!original) return res.status(404).json({ error: 'Message not found' });

    const { body_html, body_text, cc, bcc, body } = req.body || {};
    const attachments = filesToAttachments(req.files);
    const plainBody = body_text ?? body ?? '';
    const htmlBody = body_html ?? (plainBody ? `<div>${plainBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>` : '');

    if (!plainBody && !htmlBody && attachments.length === 0) return res.status(400).json({ error: 'body is required' });

    if (original.channel_type !== 'email') {
      // Unipile-pad: WhatsApp / Instagram / LinkedIn
      if (!unipile.isConfigured()) {
        return res.status(400).json({
          error: 'Unipile niet geconfigureerd — gebruik de deep-link of configureer Unipile in Instellingen',
          deep_link: original.deep_link,
          needs_setup: true,
        });
      }
      const chatId = original.thread_id;
      if (!chatId) return res.status(400).json({ error: 'Geen thread_id (chat) gevonden voor dit bericht' });
      try {
        const sent = await unipile.sendMessage(chatId, plainBody);
        const localId = uuid();
        db.prepare(`
          INSERT OR IGNORE INTO messages (
            id, external_id, channel_id, contact_id, direction, snippet, body_text,
            deep_link, thread_id, status, priority, received_at
          ) VALUES (
            @id, @external_id, @channel_id, @contact_id, 'outbound', @snippet, @body_text,
            @deep_link, @thread_id, 'archived', 'medium', @received_at
          )
        `).run({
          id: localId,
          external_id: sent?.id || sent?.message_id || `local-${localId}`,
          channel_id: original.channel_id,
          contact_id: original.contact_id,
          snippet: plainBody.slice(0, 200),
          body_text: plainBody,
          deep_link: original.deep_link,
          thread_id: chatId,
          received_at: new Date().toISOString(),
        });

        // GEEN auto-done — gesprek blijft open zodat Ramon nog een vervolg kan sturen.
        // Wel: extern markeren als gelezen + interaction-log voor training data.
        const threadOpenIds = openIdsInThread(req.params.id);
        for (const tid of threadOpenIds) {
          logInteraction(tid, 'replied', 'Beantwoord via Comm Hub', 'sent');
        }
        markExternalReadBulk(threadOpenIds);

        return res.json({
          ok: true,
          message_id: localId,
          channel_type: original.channel_type,
          original_id: req.params.id,
          original_done: false,
          thread_done_count: 0,
        });
      } catch (e) {
        return res.status(500).json({ error: e.message, deep_link: original.deep_link });
      }
    }

    const to = original.contact_email;
    if (!to) return res.status(400).json({ error: 'No contact email to reply to' });

    // Threading headers
    const inReplyTo = original.in_reply_to || null;
    // References: voor stap 3 simpel — gebruik in_reply_to als chain
    const references = inReplyTo;

    const result = await sendReply(original.channel_id, {
      threadId: original.thread_id,
      to,
      cc: cc || null,
      bcc: bcc || null,
      subject: original.subject || '(geen onderwerp)',
      bodyHtml: htmlBody,
      bodyText: plainBody,
      inReplyTo,
      references,
      attachments: attachments.length ? attachments : undefined,
    });

    // Sla het verzonden bericht lokaal op (status='archived' voor outbound)
    const localId = uuid();
    const snippet = ((plainBody || htmlBody.replace(/<[^>]+>/g, '')).trim()
      || (attachments.length ? `📎 ${attachments.length} bijlage${attachments.length === 1 ? '' : 'n'}` : '')).slice(0, 200);
    const localAttachments = attachments.map((att, idx) => ({
      id: `reply-${idx}-${Date.now()}`,
      filename: att.filename,
      mimeType: att.mimeType,
      size: att.size,
    }));

    db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, external_id, channel_id, contact_id, direction, subject, snippet,
        body_html, body_text, deep_link, thread_id, in_reply_to,
        status, priority, received_at, attachments_json
      ) VALUES (
        @id, @external_id, @channel_id, @contact_id, 'outbound', @subject, @snippet,
        @body_html, @body_text, @deep_link, @thread_id, @in_reply_to,
        'archived', 'medium', @received_at, @attachments_json
      )
    `).run({
      id: localId,
      external_id: result.messageId,
      channel_id: original.channel_id,
      contact_id: original.contact_id,
      subject: original.subject?.startsWith('Re:') ? original.subject : `Re: ${original.subject || '(geen onderwerp)'}`,
      snippet,
      body_html: htmlBody,
      body_text: plainBody,
      deep_link: original.deep_link,
      thread_id: result.threadId || original.thread_id,
      in_reply_to: original.external_id || null,
      received_at: new Date().toISOString(),
      attachments_json: localAttachments.length ? JSON.stringify(localAttachments) : null,
    });

    // GEEN auto-done — gesprek blijft open na reply. Wel: extern markeren als gelezen
    // en interaction-log voor training data.
    const threadOpenIds = openIdsInThread(req.params.id);
    for (const tid of threadOpenIds) {
      logInteraction(tid, 'replied', 'Beantwoord via Comm Hub', 'sent');
    }
    if (threadOpenIds.length) {
      markExternalReadBulk(threadOpenIds);
    } else if (original.external_id) {
      markAsReadInGmail(original.channel_id, original.external_id);
    }

    res.json({
      ok: true,
      message_id: localId,
      gmail_message_id: result.messageId,
      thread_id: result.threadId,
      from: result.fromEmail,
      original_id: req.params.id,
      original_done: false,
      thread_done_count: 0,
    });
  } catch (e) { next(e); }
});

// POST /api/messages/:id/reply-with-media — reply met bestanden (alleen Unipile-kanalen)
router.post('/:id/reply-with-media', mediaUpload.array('files', 5), async (req, res) => {
  try {
    const original = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(req.params.id);
    if (!original) return res.status(404).json({ error: 'Message not found' });

    const text = (req.body?.text || '').toString();
    const files = req.files || [];
    if (!text.trim() && files.length === 0) {
      return res.status(400).json({ error: 'tekst of minstens 1 bestand vereist' });
    }
    if (original.channel_type === 'email') {
      return res.status(400).json({ error: 'Email-bijlagen worden nog niet ondersteund via deze route' });
    }
    if (!unipile.isConfigured()) {
      return res.status(400).json({ error: 'Unipile niet geconfigureerd' });
    }
    const chatId = original.thread_id;
    if (!chatId) return res.status(400).json({ error: 'Geen thread_id (chat) gevonden voor dit bericht' });

    let sent;
    try {
      sent = await unipile.sendMessageWithAttachments(chatId, text, files.map((f) => ({
        buffer: f.buffer,
        filename: f.originalname,
        mimetype: f.mimetype,
      })));
    } catch (e) {
      return res.status(502).json({ error: e.message, deep_link: original.deep_link });
    }

    // Sla het verzonden bericht lokaal op met genormaliseerde attachments
    const localAttachments = files.map((f, idx) => ({
      id: `local-${idx}-${Date.now()}`,
      kind: kindForMime(f.mimetype, f.originalname),
      mime: f.mimetype,
      url: null, // Unipile-response geeft url's, maar de browser heeft die niet nodig: we tonen meteen
      filename: f.originalname,
      size: f.size,
    }));
    // Als de Unipile response wel URLs teruggeeft per attachment, gebruik die zodat we ze direct kunnen tonen
    if (Array.isArray(sent?.attachments)) {
      sent.attachments.forEach((a, idx) => {
        if (localAttachments[idx] && (a.url || a.download_url)) {
          localAttachments[idx].url = a.url || a.download_url;
        }
      });
    }

    const localId = uuid();
    const snippet = (text.trim() || `📎 ${files.length} bijlage${files.length === 1 ? '' : 'n'}`).slice(0, 200);

    db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, external_id, channel_id, contact_id, direction, snippet, body_text,
        deep_link, thread_id, status, priority, received_at, attachments_json
      ) VALUES (
        @id, @external_id, @channel_id, @contact_id, 'outbound', @snippet, @body_text,
        @deep_link, @thread_id, 'archived', 'medium', @received_at, @attachments_json
      )
    `).run({
      id: localId,
      external_id: sent?.id || sent?.message_id || `local-${localId}`,
      channel_id: original.channel_id,
      contact_id: original.contact_id,
      snippet,
      body_text: text,
      deep_link: original.deep_link,
      thread_id: chatId,
      received_at: new Date().toISOString(),
      attachments_json: JSON.stringify(localAttachments),
    });

    // GEEN auto-done — gesprek blijft open na reply (ook met bijlagen). Wel: log + mark-read.
    const threadOpenIds = openIdsInThread(req.params.id);
    for (const tid of threadOpenIds) {
      logInteraction(tid, 'replied', 'Beantwoord via Comm Hub', 'sent');
    }
    markExternalReadBulk(threadOpenIds);

    return res.json({
      ok: true,
      message_id: localId,
      channel_type: original.channel_type,
      attachments: localAttachments.length,
      original_id: req.params.id,
      original_done: false,
      thread_done_count: 0,
    });
  } catch (e) {
    if (e?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Bestand groter dan 10MB' });
    if (e?.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ error: 'Max 5 bestanden' });
    return res.status(500).json({ error: e.message || 'Upload mislukt' });
  }
});

// Gmail send heeft een raw-message limiet (~35MB inclusief base64-overhead);
// houd 25MB aan netto-payload aan als veilige marge.
const FORWARD_MAX_TOTAL_BYTES = 25 * 1024 * 1024;

// POST /api/messages/:id/forward — stuur een email door
router.post('/:id/forward', upload.array('files', 10), async (req, res, next) => {
  try {
    const original = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(req.params.id);
    if (!original) return res.status(404).json({ error: 'Message not found' });
    if (original.channel_type !== 'email') {
      return res.status(400).json({ error: 'Doorsturen is alleen beschikbaar voor email' });
    }

    const { to, cc, bcc, extra_text } = req.body || {};
    if (!to || typeof to !== 'string' || !to.trim()) {
      return res.status(400).json({ error: 'Aan-veld (to) is verplicht' });
    }

    const subject = (original.subject || '').replace(/^(Fwd?:\s*)+/i, '');
    const forwardSubject = `Fwd: ${subject || '(geen onderwerp)'}`;

    // ===== FIX 1 — stuur de HELE thread mee zodat de ontvanger volledige context heeft =====
    const threadKey = original.thread_id || original.id;
    const threadMsgs = db.prepare(`
      SELECT m.*, c.name AS contact_name
      FROM messages m
      LEFT JOIN contacts c ON c.id = m.contact_id
      WHERE COALESCE(m.thread_id, m.id) = ?
      ORDER BY m.received_at ASC
    `).all(threadKey);

    const whoFor = (m) => (m.direction === 'outbound' ? 'Ramon Brugman' : (m.contact_name || 'Onbekend'));
    const fmtDate = (m) => {
      const d = new Date(m.received_at);
      return isNaN(d.getTime())
        ? (m.received_at || '')
        : d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const threadHtml = threadMsgs.map((m) => {
      const bodyInner = m.body_html || `<p>${escapeHtmlForForward(m.body_text || m.snippet || '').replace(/\n/g, '<br>')}</p>`;
      return `<div style="margin-bottom:16px;">
        <p style="color:#666;font-size:12px;margin:0 0 4px 0;"><b>${escapeHtmlForForward(whoFor(m))}</b> — ${escapeHtmlForForward(fmtDate(m))}</p>
        <div>${bodyInner}</div>
      </div>`;
    }).join('<hr style="border:none;border-top:1px solid #eee;margin:12px 0;">');

    const threadText = threadMsgs.map((m) => {
      return `${whoFor(m)} — ${fmtDate(m)}\n${m.body_text || m.snippet || ''}\n`;
    }).join('\n---\n\n');

    const extra = (extra_text || '').toString();

    const bodyHtml = (extra ? `<div>${escapeHtmlForForward(extra).replace(/\n/g, '<br>')}</div><br>` : '') +
      `<div style="border-left:2px solid #ccc;padding-left:12px;color:#555;">
        <p><b>---------- Doorgestuurd bericht ---------</b><br>
        Onderwerp: ${escapeHtmlForForward(original.subject || '(geen onderwerp)')}<br>
        ${threadMsgs.length} bericht${threadMsgs.length === 1 ? '' : 'en'} in deze thread</p>
        <br>
        ${threadHtml}
      </div>`;

    const bodyText = (extra ? extra + '\n\n' : '') +
      `---------- Doorgestuurd bericht ---------\n` +
      `Onderwerp: ${original.subject || '(geen onderwerp)'}\n` +
      `${threadMsgs.length} bericht${threadMsgs.length === 1 ? '' : 'en'}\n\n` +
      threadText;

    const origText = original.body_text || (original.snippet || '');

    // Bijlagen downloaden uit Gmail en meesturen in de doorgestuurde mail
    const attachmentMeta = parseForwardAttachments(original.attachments_json);
    const downloadedAttachments = [];
    let totalBytes = 0;
    if (attachmentMeta.length) {
      if (!original.external_id) {
        return res.status(400).json({ error: 'Origineel bericht heeft geen Gmail message-id — bijlagen niet ophaalbaar' });
      }
      const client = getClient(original.channel_id);
      if (!client) {
        return res.status(400).json({ error: 'Email-kanaal niet verbonden — bijlagen niet ophaalbaar' });
      }
      const gmail = google.gmail({ version: 'v1', auth: client });
      for (const att of attachmentMeta) {
        try {
          const { data } = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: original.external_id,
            id: att.id,
          });
          if (!data?.data) continue;
          const buffer = Buffer.from(data.data, 'base64url');
          totalBytes += buffer.length;
          if (totalBytes > FORWARD_MAX_TOTAL_BYTES) {
            return res.status(413).json({
              error: `Bijlagen samen groter dan ${Math.round(FORWARD_MAX_TOTAL_BYTES / (1024 * 1024))}MB — Gmail limiet`,
            });
          }
          downloadedAttachments.push({
            content: buffer,
            filename: att.filename || 'bestand',
            mimeType: att.mimeType || 'application/octet-stream',
            size: buffer.length,
          });
        } catch (err) {
          console.error(`forward: kon bijlage ${att.filename} niet downloaden:`, err.message);
          return res.status(502).json({ error: `Bijlage ${att.filename || ''} ophalen mislukt: ${err.message}` });
        }
      }
    }

    // FIX 2 — combineer originele bijlagen met nieuw geüploade bestanden
    const uploadedAttachments = filesToAttachments(req.files);
    for (const att of uploadedAttachments) {
      totalBytes += att.size || (att.content ? att.content.length : 0);
      if (totalBytes > FORWARD_MAX_TOTAL_BYTES) {
        return res.status(413).json({
          error: `Bijlagen samen groter dan ${Math.round(FORWARD_MAX_TOTAL_BYTES / (1024 * 1024))}MB — Gmail limiet`,
        });
      }
    }
    const allAttachments = [...downloadedAttachments, ...uploadedAttachments];

    const result = await sendNew(original.channel_id, {
      to: to.trim(),
      cc: cc || null,
      bcc: bcc || null,
      subject: forwardSubject,
      bodyHtml,
      bodyText,
      attachments: allAttachments.length ? allAttachments : undefined,
    });

    // Lokaal opslaan als outbound met genormaliseerde attachments-metadata
    const localId = uuid();
    const localAttachments = allAttachments.map((att, idx) => ({
      id: `fwd-${idx}-${Date.now()}`,
      filename: att.filename,
      mimeType: att.mimeType,
      size: att.size,
    }));
    db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, external_id, channel_id, contact_id, direction, subject, snippet,
        body_html, body_text, thread_id, status, priority, received_at, attachments_json
      ) VALUES (
        @id, @external_id, @channel_id, @contact_id, 'outbound', @subject, @snippet,
        @body_html, @body_text, @thread_id, 'archived', 'medium', @received_at, @attachments_json
      )
    `).run({
      id: localId,
      external_id: result.messageId,
      channel_id: original.channel_id,
      contact_id: null,
      subject: forwardSubject,
      snippet: (extra || origText).trim().slice(0, 200),
      body_html: bodyHtml,
      body_text: bodyText,
      thread_id: result.threadId || null,
      received_at: new Date().toISOString(),
      attachments_json: localAttachments.length ? JSON.stringify(localAttachments) : null,
    });

    logInteraction(req.params.id, 'replied', `Doorgestuurd naar ${to}`, 'sent');

    res.json({
      ok: true,
      message_id: localId,
      gmail_message_id: result.messageId,
      from: result.fromEmail,
      to: to.trim(),
      attachments: localAttachments.length,
      original_id: req.params.id,
    });
  } catch (e) { next(e); }
});

function parseForwardAttachments(attachmentsJson) {
  if (!attachmentsJson) return [];
  try {
    const list = JSON.parse(attachmentsJson);
    if (!Array.isArray(list)) return [];
    return list
      .filter((a) => a && a.id)
      .map((a) => ({
        id: a.id,
        filename: a.filename || a.file_name || 'bestand',
        mimeType: a.mimeType || a.mime || 'application/octet-stream',
      }));
  } catch {
    return [];
  }
}

function escapeHtmlForForward(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// POST /api/messages/compose — nieuw bericht (geen reply)
router.post('/compose', upload.array('files', 10), async (req, res, next) => {
  try {
    const { channel_id, to, cc, bcc, subject, body_html, body_text } = req.body || {};
    const attachments = filesToAttachments(req.files);
    if (!channel_id || !to || !(body_html || body_text || attachments.length)) {
      return res.status(400).json({ error: 'channel_id, to en body zijn verplicht' });
    }

    const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND type = ?').get(channel_id, 'email');
    if (!channel) return res.status(404).json({ error: 'Email channel not found' });

    const result = await sendNew(channel_id, {
      to,
      cc: cc || null,
      bcc: bcc || null,
      subject: subject || '(geen onderwerp)',
      bodyHtml: body_html || null,
      bodyText: body_text || null,
      attachments: attachments.length ? attachments : undefined,
    });

    // Match contact en sla lokaal op
    const contact = matchContact({ email: to.split('<').pop().replace('>', '').trim(), name: null, phone: null });

    const localId = uuid();
    const localAttachments = attachments.map((att, idx) => ({
      id: `compose-${idx}-${Date.now()}`,
      filename: att.filename,
      mimeType: att.mimeType,
      size: att.size,
    }));
    const snippet = ((body_text || body_html?.replace(/<[^>]+>/g, '') || '').trim()
      || (attachments.length ? `📎 ${attachments.length} bijlage${attachments.length === 1 ? '' : 'n'}` : '')).slice(0, 200);

    db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, external_id, channel_id, contact_id, direction, subject, snippet,
        body_html, body_text, thread_id, status, priority, received_at, attachments_json
      ) VALUES (
        @id, @external_id, @channel_id, @contact_id, 'outbound', @subject, @snippet,
        @body_html, @body_text, @thread_id, 'archived', 'medium', @received_at, @attachments_json
      )
    `).run({
      id: localId, external_id: result.messageId, channel_id, contact_id: contact?.id || null,
      subject: subject || '(geen onderwerp)', snippet, body_html, body_text,
      thread_id: result.threadId, received_at: new Date().toISOString(),
      attachments_json: localAttachments.length ? JSON.stringify(localAttachments) : null,
    });

    res.json({ ok: true, message_id: localId, gmail_message_id: result.messageId, thread_id: result.threadId, from: result.fromEmail, attachments: localAttachments.length });
  } catch (e) { next(e); }
});

// POST /api/messages/todo — voeg een to-do toe als bericht in het todo-1 kanaal.
// Een to-do is gewoon een message; alle inbox-acties (snooze/done/pin/urgent) werken.
router.post('/todo', (req, res) => {
  try {
    const { title, description, due_date, priority, source_message_id } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    const sourceId = source_message_id || null;

    const id = uuid();

    // Maak een "Ramon" contact als die niet bestaat (voor de avatar / contact-join)
    let ramonContact = db.prepare("SELECT id FROM contacts WHERE email = 'ramon@endlessminds.nl'").get();
    if (!ramonContact) {
      ramonContact = { id: uuid() };
      db.prepare("INSERT INTO contacts (id, name, email, avatar_initials, avatar_color) VALUES (?, 'Ramon', 'ramon@endlessminds.nl', 'RB', '#3b82f6')")
        .run(ramonContact.id);
    }

    // Een to-do staat ALTIJD 'open' met vandaag als datum (bovenaan inbox).
    // De deadline is puur informatief — Ramon snoozet zelf als hij 'm later wil doen.
    const baseText = description?.trim() || title.trim();
    let snippetText = baseText;
    let bodyText = description?.trim() || null;
    if (due_date) {
      const d = new Date(due_date);
      if (!isNaN(d.getTime())) {
        const label = d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        snippetText = `${baseText} · Deadline: ${label}`;
        bodyText = `${bodyText ? bodyText + '\n\n' : ''}Deadline: ${label}`;
      }
    }

    // source_message_id (optioneel) bewaren we in thread_id zodat de link naar het
    // oorspronkelijke bericht behouden blijft.
    db.prepare(`
      INSERT INTO messages (id, channel_id, contact_id, direction, subject, snippet, body_text, status, priority, received_at, thread_id, created_at, updated_at)
      VALUES (?, 'todo-1', ?, 'inbound', ?, ?, ?, 'open', ?, datetime('now'), ?, datetime('now'), datetime('now'))
    `).run(
      id,
      ramonContact.id,
      title.trim(),
      snippetText,
      bodyText,
      priority || 'medium',
      sourceId,
    );

    res.json({ ok: true, id, title: title.trim() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/messages/compose-chat — start nieuw WhatsApp/LinkedIn/Instagram gesprek of stuur in bestaande chat
router.post('/compose-chat', async (req, res) => {
  try {
    const { channel_id, contact_id, phone, recipient_name, text } = req.body || {};
    if (!channel_id || !text) return res.status(400).json({ error: 'channel_id en text zijn verplicht' });

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channel_id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    if (!['whatsapp', 'linkedin', 'instagram'].includes(channel.type)) {
      return res.status(400).json({ error: 'Channel is geen chat-kanaal' });
    }

    let unipileAccountId = null;
    try {
      const cfg = channel.config_json ? JSON.parse(channel.config_json) : {};
      unipileAccountId = cfg.unipile_account_id || null;
    } catch { /* ignore */ }
    if (!unipileAccountId) return res.status(400).json({ error: 'Channel niet gekoppeld aan Unipile' });

    // Bepaal ontvanger — voorkeur: phone-arg, anders contact lookup
    let attendeeIdentifier = phone || null;
    let contact = contact_id ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(contact_id) : null;
    if (!attendeeIdentifier && contact?.phone) attendeeIdentifier = contact.phone;

    // Bestaande chat? → hergebruik thread_id (sendMessage in plaats van startNewChat)
    let existingThreadId = null;
    if (contact_id) {
      const existing = db.prepare(`
        SELECT thread_id FROM messages
        WHERE contact_id = ? AND channel_id = ? AND thread_id IS NOT NULL
        ORDER BY received_at DESC
        LIMIT 1
      `).get(contact_id, channel_id);
      existingThreadId = existing?.thread_id || null;
    }

    if (existingThreadId) {
      try {
        await unipile.sendMessage(existingThreadId, text);
        const msgId = uuid();
        db.prepare(`
          INSERT INTO messages (id, channel_id, contact_id, direction, snippet, body_text, thread_id, status, priority, received_at)
          VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'archived', 'medium', datetime('now'))
        `).run(msgId, channel_id, contact?.id || null, text.slice(0, 200), text, existingThreadId);
        return res.json({ ok: true, message_id: msgId, thread_id: existingThreadId, used_existing_chat: true });
      } catch (e) {
        console.log('[COMPOSE-CHAT] send to existing chat failed, trying new chat:', e.message);
      }
    }

    if (!attendeeIdentifier) {
      const deepLink = channel.type === 'whatsapp'
        ? `https://wa.me/?text=${encodeURIComponent(text)}`
        : null;
      return res.json({
        ok: false,
        fallback: true,
        deep_link: deepLink,
        error: 'Geen telefoonnummer of bestaande chat gevonden.',
      });
    }

    try {
      console.log(`[COMPOSE-CHAT] startNewChat account=${unipileAccountId} attendee=${attendeeIdentifier} text=${text.slice(0, 30)}`);
      const result = await unipile.startNewChat(unipileAccountId, attendeeIdentifier, text);
      const newThreadId = result?.chat_id || result?.id || null;

      const msgId = uuid();
      db.prepare(`
        INSERT INTO messages (id, channel_id, contact_id, direction, snippet, body_text, thread_id, status, priority, received_at)
        VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'archived', 'medium', datetime('now'))
      `).run(msgId, channel_id, contact?.id || null, text.slice(0, 200), text, newThreadId);

      return res.json({ ok: true, message_id: msgId, thread_id: newThreadId, used_existing_chat: false });
    } catch (e) {
      const cleanPhone = String(attendeeIdentifier || '').replace(/[^0-9+]/g, '');
      const deepLink = channel.type === 'whatsapp' && cleanPhone
        ? `https://wa.me/${cleanPhone.replace(/^\+/, '')}?text=${encodeURIComponent(text)}`
        : null;
      return res.json({
        ok: false,
        fallback: true,
        deep_link: deepLink,
        error: e.message || 'Versturen via Unipile mislukt',
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message || 'Compose-chat mislukt' });
  }
});

// PATCH /api/messages/:id/snooze — werkt op de hele thread (alle open berichten)
router.patch('/:id/snooze', (req, res) => {
  const { snoozed_until } = req.body;
  if (!snoozed_until) return res.status(400).json({ error: 'snoozed_until is required' });

  const ids = openIdsInThread(req.params.id);
  if (ids.length === 0) return res.status(404).json({ error: 'Message not found' });

  const stmt = db.prepare(`
    UPDATE messages SET status = 'snoozed', snoozed_until = ?, snoozed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND status = 'open'
  `);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of ids) n += stmt.run(snoozed_until, id).changes;
    return n;
  });
  const changed = tx();
  if (changed === 0) {
    // Fallback: probeer ook niet-open status (compat met conversation view)
    const fb = db.prepare(`UPDATE messages SET status='snoozed', snoozed_until=?, snoozed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`).run(snoozed_until, req.params.id);
    if (fb.changes === 0) return res.status(404).json({ error: 'Message not found' });
  }
  for (const id of ids) logInteraction(id, 'snoozed');
  res.json({ ok: true, id: req.params.id, status: 'snoozed', snoozed_until, thread_updated: changed });
});

// PATCH /api/messages/:id/done — werkt op hele thread (alle open berichten)
router.patch('/:id/done', (req, res) => {
  const { note, category } = req.body || {};
  const validCategories = ['replied', 'called', 'offer_sent', 'forwarded', 'not_relevant', 'other'];
  const finalCategory = validCategories.includes(category) ? category : 'other';

  const ids = openIdsInThread(req.params.id);
  if (ids.length === 0) return res.status(404).json({ error: 'Message not found' });

  const stmt = db.prepare(`
    UPDATE messages SET
      status = 'done', done_at = datetime('now'),
      done_note = ?, done_category = ?, updated_at = datetime('now')
    WHERE id = ? AND status = 'open'
  `);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of ids) n += stmt.run(note || null, finalCategory, id).changes;
    return n;
  });
  const changed = tx();
  if (changed === 0) {
    const fb = db.prepare(`
      UPDATE messages SET status='done', done_at=datetime('now'), done_note=?, done_category=?, updated_at=datetime('now')
      WHERE id=?
    `).run(note || null, finalCategory, req.params.id);
    if (fb.changes === 0) return res.status(404).json({ error: 'Message not found' });
  }
  for (const id of ids) logInteraction(id, 'done', note);
  markExternalReadBulk(ids);
  completeAsanaTasksForMessages(ids);

  res.json({ ok: true, id: req.params.id, status: 'done', thread_updated: changed });
});

// PATCH /api/messages/:id/waiting (wacht op reactie)
router.patch('/:id/waiting', (req, res) => {
  const result = db.prepare(`
    UPDATE messages SET status = 'waiting', snoozed_until = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
  logInteraction(req.params.id, 'snoozed');
  res.json({ ok: true, id: req.params.id, status: 'waiting' });
});

// PATCH /api/messages/:id/reopen
router.patch('/:id/reopen', (req, res) => {
  const result = db.prepare(`
    UPDATE messages SET
      status = 'open', snoozed_until = NULL, done_at = NULL, done_note = NULL, done_category = NULL,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
  logInteraction(req.params.id, 'opened', 'Heropend');
  res.json({ ok: true, id: req.params.id, status: 'open' });
});

// PATCH /api/messages/:id/priority
router.patch('/:id/priority', (req, res) => {
  const { priority } = req.body;
  if (!['high', 'medium', 'low'].includes(priority)) {
    return res.status(400).json({ error: 'priority must be high|medium|low' });
  }
  const result = db.prepare(`UPDATE messages SET priority = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(priority, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
  res.json({ ok: true, id: req.params.id, priority });
});

// POST /api/messages/bulk/snooze — elke id wordt geëxpandeerd naar zijn thread
router.post('/bulk/snooze', (req, res) => {
  const { ids, snoozed_until } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  if (!snoozed_until) return res.status(400).json({ error: 'snoozed_until is required' });

  const expanded = [...new Set(ids.flatMap((id) => openIdsInThread(id)))];
  const stmt = db.prepare(`UPDATE messages SET status = 'snoozed', snoozed_until = ?, snoozed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status = 'open'`);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of expanded) n += stmt.run(snoozed_until, id).changes;
    return n;
  });
  const updated = tx();
  logInteractionsBulk(expanded, 'snoozed');
  res.json({ ok: true, updated });
});

// POST /api/messages/bulk/done — elke id wordt geëxpandeerd naar zijn thread
router.post('/bulk/done', (req, res) => {
  const { ids, note, category } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  const validCategories = ['replied', 'called', 'offer_sent', 'forwarded', 'not_relevant', 'other'];
  const finalCategory = validCategories.includes(category) ? category : 'other';

  const expanded = [...new Set(ids.flatMap((id) => openIdsInThread(id)))];
  const stmt = db.prepare(`
    UPDATE messages SET status = 'done', done_at = datetime('now'), done_note = ?, done_category = ?, updated_at = datetime('now')
    WHERE id = ? AND status = 'open'
  `);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of expanded) n += stmt.run(note || null, finalCategory, id).changes;
    return n;
  });
  const updated = tx();

  markExternalReadBulk(expanded);
  completeAsanaTasksForMessages(expanded);
  logInteractionsBulk(expanded, 'done', note);
  res.json({ ok: true, updated });
});

// POST /api/messages/bulk/archive — elke id wordt geëxpandeerd naar zijn thread
router.post('/bulk/archive', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });

  const expanded = [...new Set(ids.flatMap((id) => openIdsInThread(id)))];
  const stmt = db.prepare(`UPDATE messages SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND status = 'open'`);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of expanded) n += stmt.run(id).changes;
    return n;
  });
  const updated = tx();
  logInteractionsBulk(expanded, 'archived');
  markExternalReadBulk(expanded, true);
  res.json({ ok: true, updated, archived: updated });
});

// POST /api/messages/bulk/reopen — undo voor archive/snooze/done
router.post('/bulk/reopen', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });

  const stmt = db.prepare(`
    UPDATE messages SET
      status = 'open',
      snoozed_until = NULL,
      done_at = NULL,
      done_note = NULL,
      done_category = NULL,
      updated_at = datetime('now')
    WHERE id = ?
  `);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of ids) n += stmt.run(id).changes;
    return n;
  });
  const updated = tx();
  logInteractionsBulk(ids, 'opened', 'Heropend');
  res.json({ ok: true, updated, reopened: updated });
});

// DELETE /api/messages/:id (soft delete -> archived) — werkt op hele thread (alle open berichten)
router.delete('/:id', (req, res) => {
  const ids = openIdsInThread(req.params.id);
  if (ids.length === 0) return res.status(404).json({ error: 'Message not found' });

  const stmt = db.prepare(`UPDATE messages SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND status = 'open'`);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of ids) n += stmt.run(id).changes;
    return n;
  });
  const changed = tx();
  if (changed === 0) {
    const fb = db.prepare(`UPDATE messages SET status='archived', updated_at=datetime('now') WHERE id=?`).run(req.params.id);
    if (fb.changes === 0) return res.status(404).json({ error: 'Message not found' });
  }
  for (const id of ids) logInteraction(id, 'archived');
  markExternalReadBulk(ids, true);
  res.json({ ok: true, id: req.params.id, status: 'archived', thread_updated: changed });
});

// Best-effort sync naar het externe kanaal (Gmail of Unipile).
// `seen` voorkomt dubbele Unipile-calls per thread.
// `shouldArchive=true` verwijdert het bericht óók uit Gmail INBOX / dempt de WA-chat.
function markExternalRead(messageId, seen = new Set(), shouldArchive = false) {
  const row = db.prepare(`
    SELECT m.external_id, m.channel_id, m.thread_id, ch.type
    FROM messages m
    LEFT JOIN channels ch ON ch.id = m.channel_id
    WHERE m.id = ?
  `).get(messageId);
  if (!row) return;
  if (row.type === 'email') {
    if (row.external_id) {
      if (shouldArchive) archiveInGmail(row.channel_id, row.external_id);
      else markAsReadInGmail(row.channel_id, row.external_id);
    }
    return;
  }
  if ((row.type === 'whatsapp' || row.type === 'instagram' || row.type === 'linkedin') && row.thread_id) {
    const key = `chat:${row.thread_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    unipile.markChatAsRead(row.thread_id).catch(() => { /* best-effort */ });
    if (shouldArchive) {
      unipile.archiveChat(row.thread_id).catch(() => { /* best-effort */ });
    }
  }
}

function markExternalReadBulk(messageIds, shouldArchive = false) {
  const seen = new Set();
  for (const id of messageIds) markExternalRead(id, seen, shouldArchive);
}

// Geef alle OPEN message-ids in dezelfde thread terug (inclusief het opgegeven id).
// Voor berichten zonder thread_id: alleen het bericht zelf.
function openIdsInThread(messageId) {
  const row = db.prepare('SELECT thread_id FROM messages WHERE id = ?').get(messageId);
  if (!row) return [];
  if (!row.thread_id) return [messageId];
  const ids = db
    .prepare(`SELECT id FROM messages WHERE thread_id = ? AND status = 'open'`)
    .all(row.thread_id)
    .map((r) => r.id);
  return ids.length ? ids : [messageId];
}

function logInteraction(messageId, action, note, outcome) {
  const msg = db.prepare('SELECT contact_id, channel_id FROM messages WHERE id = ?').get(messageId);
  if (!msg) return;
  const channelType = db.prepare('SELECT type FROM channels WHERE id = ?').get(msg.channel_id)?.type;
  try {
    db.prepare(`
      INSERT INTO interaction_logs (id, message_id, contact_id, action, channel_type, note, outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuid(), messageId, msg.contact_id, action, channelType, note || null, outcome || null);
  } catch (e) {
    console.error('Failed to log interaction:', e.message);
  }
}

function logInteractionsBulk(ids, action, note) {
  for (const id of ids) logInteraction(id, action, note);
}

export default router;
