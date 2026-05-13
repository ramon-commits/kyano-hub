import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db/init.js';

const router = Router();

function normalizeShortcut(s) {
  if (!s) return s;
  const trimmed = String(s).trim();
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

// GET /api/quick-replies — list (optioneel filter ?channel_type=email)
router.get('/', (req, res) => {
  const { channel_type } = req.query;
  let rows;
  if (channel_type) {
    rows = db.prepare(`
      SELECT * FROM quick_replies
      WHERE channel_type IS NULL OR channel_type = ?
      ORDER BY shortcut ASC
    `).all(channel_type);
  } else {
    rows = db.prepare(`SELECT * FROM quick_replies ORDER BY shortcut ASC`).all();
  }
  res.json({ quick_replies: rows, total: rows.length });
});

// POST /api/quick-replies — create
router.post('/', (req, res) => {
  const { shortcut, title, body, channel_type } = req.body || {};
  if (!shortcut || !title || !body) {
    return res.status(400).json({ error: 'shortcut, title, body zijn verplicht' });
  }
  const id = uuid();
  const finalShortcut = normalizeShortcut(shortcut);
  try {
    db.prepare(`
      INSERT INTO quick_replies (id, shortcut, title, body, channel_type)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, finalShortcut, title, body, channel_type || null);
    res.status(201).json({ ok: true, id, shortcut: finalShortcut });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: `Shortcut ${finalShortcut} bestaat al` });
    }
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/quick-replies/:id — update
router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM quick_replies WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { shortcut, title, body, channel_type } = req.body || {};
  const finalShortcut = shortcut !== undefined ? normalizeShortcut(shortcut) : existing.shortcut;
  try {
    db.prepare(`
      UPDATE quick_replies SET
        shortcut = ?,
        title = COALESCE(?, title),
        body = COALESCE(?, body),
        channel_type = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      finalShortcut,
      title ?? null,
      body ?? null,
      channel_type === undefined ? existing.channel_type : (channel_type || null),
      req.params.id,
    );
    res.json({ ok: true, id: req.params.id });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: `Shortcut ${finalShortcut} bestaat al` });
    }
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/quick-replies/:id
router.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM quick_replies WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, deleted: req.params.id });
});

export default router;
