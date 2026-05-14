import { Router } from 'express';
import db from '../db/init.js';
import { v4 as uuid } from 'uuid';

const router = Router();

const PLATFORMS = new Set(['instagram', 'linkedin', 'facebook', 'twitter']);
const STATUSES = new Set(['draft', 'scheduled', 'published', 'failed']);

function rowOut(r) {
  if (!r) return null;
  return {
    ...r,
    media_urls: parseJsonArray(r.media_urls),
    tags: parseJsonArray(r.tags),
  };
}

function parseJsonArray(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    // Comma-separated fallback
    return String(s).split(',').map((x) => x.trim()).filter(Boolean);
  }
}

function stringifyArray(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'string') {
    const arr = value.split(',').map((x) => x.trim()).filter(Boolean);
    return arr.length ? JSON.stringify(arr) : null;
  }
  return null;
}

// GET /api/social/posts?status=&platform=&from=&to=
router.get('/posts', (req, res) => {
  const { status, platform, from, to } = req.query;
  const where = [];
  const params = {};
  if (status) {
    if (!STATUSES.has(status)) return res.status(400).json({ error: 'invalid status' });
    where.push('status = @status'); params.status = status;
  }
  if (platform) {
    if (!PLATFORMS.has(platform)) return res.status(400).json({ error: 'invalid platform' });
    where.push('platform = @platform'); params.platform = platform;
  }
  if (from) { where.push('scheduled_at >= @from'); params.from = from; }
  if (to) { where.push('scheduled_at <= @to'); params.to = to; }
  const sql = `SELECT * FROM social_posts ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY COALESCE(scheduled_at, created_at) DESC`;
  const rows = db.prepare(sql).all(params);
  res.json({ posts: rows.map(rowOut), total: rows.length });
});

// GET /api/social/posts/:id
router.get('/posts/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Post not found' });
  res.json(rowOut(r));
});

// POST /api/social/posts
router.post('/posts', (req, res) => {
  const { platform, status, caption, media_urls, scheduled_at, account_label, tags } = req.body || {};
  if (!platform || !PLATFORMS.has(platform)) return res.status(400).json({ error: 'platform vereist (instagram|linkedin|facebook|twitter)' });
  const finalStatus = status && STATUSES.has(status) ? status : (scheduled_at ? 'scheduled' : 'draft');
  if (finalStatus === 'scheduled' && !scheduled_at) {
    return res.status(400).json({ error: 'scheduled_at vereist wanneer status=scheduled' });
  }

  const id = uuid();
  db.prepare(`
    INSERT INTO social_posts (id, platform, status, caption, media_urls, scheduled_at, account_label, tags)
    VALUES (@id, @platform, @status, @caption, @media_urls, @scheduled_at, @account_label, @tags)
  `).run({
    id,
    platform,
    status: finalStatus,
    caption: caption || null,
    media_urls: stringifyArray(media_urls),
    scheduled_at: scheduled_at || null,
    account_label: account_label || null,
    tags: stringifyArray(tags),
  });
  const row = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(id);
  res.status(201).json(rowOut(row));
});

// PATCH /api/social/posts/:id
router.patch('/posts/:id', (req, res) => {
  const allowed = ['platform', 'status', 'caption', 'media_urls', 'scheduled_at', 'published_at', 'account_label', 'tags'];
  const sets = [];
  const params = { id: req.params.id };
  for (const k of allowed) {
    if (!(k in req.body)) continue;
    let v = req.body[k];
    if (k === 'platform' && v && !PLATFORMS.has(v)) return res.status(400).json({ error: 'invalid platform' });
    if (k === 'status' && v && !STATUSES.has(v)) return res.status(400).json({ error: 'invalid status' });
    if (k === 'media_urls' || k === 'tags') v = stringifyArray(v);
    sets.push(`${k} = @${k}`);
    params[k] = v;
  }
  if (sets.length === 0) return res.status(400).json({ error: 'no valid fields' });
  sets.push(`updated_at = datetime('now')`);
  const r = db.prepare(`UPDATE social_posts SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (r.changes === 0) return res.status(404).json({ error: 'Post not found' });
  res.json(rowOut(db.prepare('SELECT * FROM social_posts WHERE id = ?').get(req.params.id)));
});

// DELETE /api/social/posts/:id
router.delete('/posts/:id', (req, res) => {
  const r = db.prepare('DELETE FROM social_posts WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Post not found' });
  res.json({ ok: true, id: req.params.id, deleted: true });
});

// POST /api/social/posts/:id/publish — placeholder (geen Meta API in v1)
router.post('/posts/:id/publish', (req, res) => {
  const row = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Post not found' });
  res.status(501).json({
    error: 'Auto-publicatie wordt gebouwd in v2 — koppel Instagram/LinkedIn (via Meta Graph API of Unipile).',
    code: 'NOT_IMPLEMENTED',
    post: rowOut(row),
  });
});

export default router;
