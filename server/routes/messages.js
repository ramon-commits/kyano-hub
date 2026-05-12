import { Router } from 'express';
import db from '../db/init.js';
import { v4 as uuid } from 'uuid';

const router = Router();

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

// GET /api/messages
router.get('/', (req, res) => {
  const { status, channel_type, channel_id, contact_id, search, priority } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

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
    where.push(`(m.snippet LIKE @search OR m.subject LIKE @search OR c.name LIKE @search OR m.done_note LIKE @search OR m.body_text LIKE @search)`);
    params.search = `%${search}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `${MESSAGE_SELECT} ${whereSql} ORDER BY m.received_at DESC LIMIT @limit OFFSET @offset`;

  params.limit = limit;
  params.offset = offset;

  const rows = db.prepare(sql).all(params);

  const countSql = `SELECT COUNT(*) AS n FROM messages m LEFT JOIN contacts c ON c.id = m.contact_id LEFT JOIN channels ch ON ch.id = m.channel_id ${whereSql}`;
  const { limit: _l, offset: _o, ...countParams } = params;
  const total = db.prepare(countSql).get(countParams).n;

  res.json({ messages: rows, total, limit, offset });
});

// GET /api/messages/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Message not found' });
  res.json(row);
});

// PATCH /api/messages/:id/snooze
router.patch('/:id/snooze', (req, res) => {
  const { snoozed_until } = req.body;
  if (!snoozed_until) return res.status(400).json({ error: 'snoozed_until is required' });

  const result = db.prepare(`
    UPDATE messages SET status = 'snoozed', snoozed_until = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(snoozed_until, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
  logInteraction(req.params.id, 'snoozed');
  res.json({ ok: true, id: req.params.id, status: 'snoozed', snoozed_until });
});

// PATCH /api/messages/:id/done
router.patch('/:id/done', (req, res) => {
  const { note, category } = req.body || {};
  const validCategories = ['replied', 'called', 'offer_sent', 'forwarded', 'not_relevant', 'other'];
  const finalCategory = validCategories.includes(category) ? category : 'other';

  const result = db.prepare(`
    UPDATE messages SET
      status = 'done',
      done_at = datetime('now'),
      done_note = ?,
      done_category = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(note || null, finalCategory, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
  logInteraction(req.params.id, 'done', note);
  res.json({ ok: true, id: req.params.id, status: 'done' });
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

// POST /api/messages/bulk/snooze
router.post('/bulk/snooze', (req, res) => {
  const { ids, snoozed_until } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  if (!snoozed_until) return res.status(400).json({ error: 'snoozed_until is required' });

  const stmt = db.prepare(`UPDATE messages SET status = 'snoozed', snoozed_until = ?, updated_at = datetime('now') WHERE id = ?`);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of ids) n += stmt.run(snoozed_until, id).changes;
    return n;
  });
  const updated = tx();
  res.json({ ok: true, updated });
});

// POST /api/messages/bulk/done
router.post('/bulk/done', (req, res) => {
  const { ids, note, category } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  const validCategories = ['replied', 'called', 'offer_sent', 'forwarded', 'not_relevant', 'other'];
  const finalCategory = validCategories.includes(category) ? category : 'other';

  const stmt = db.prepare(`
    UPDATE messages SET status = 'done', done_at = datetime('now'), done_note = ?, done_category = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of ids) n += stmt.run(note || null, finalCategory, id).changes;
    return n;
  });
  const updated = tx();
  res.json({ ok: true, updated });
});

// DELETE /api/messages/:id (soft delete -> archived)
router.delete('/:id', (req, res) => {
  const result = db.prepare(`UPDATE messages SET status = 'archived', updated_at = datetime('now') WHERE id = ?`)
    .run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
  res.json({ ok: true, id: req.params.id, status: 'archived' });
});

function logInteraction(messageId, action, note) {
  const msg = db.prepare('SELECT contact_id, channel_id FROM messages WHERE id = ?').get(messageId);
  if (!msg) return;
  const channelType = db.prepare('SELECT type FROM channels WHERE id = ?').get(msg.channel_id)?.type;
  try {
    db.prepare(`
      INSERT INTO interaction_logs (id, message_id, contact_id, action, channel_type, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuid(), messageId, msg.contact_id, action, channelType, note || null);
  } catch (e) {
    console.error('Failed to log interaction:', e.message);
  }
}

export default router;
