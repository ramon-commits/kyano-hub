import { Router } from 'express';
import db from '../db/init.js';
import { isConnected } from '../services/gmail-oauth.js';
import { getPollerState } from '../services/poller.js';

const router = Router();

router.get('/', (_req, res) => {
  const channels = db.prepare(`
    SELECT
      c.*,
      (SELECT COUNT(*) FROM messages WHERE channel_id = c.id AND status = 'open') AS open_count,
      (SELECT COUNT(*) FROM messages WHERE channel_id = c.id) AS message_count,
      (SELECT last_sync_at FROM sync_state WHERE channel_id = c.id) AS last_sync_at,
      (SELECT last_history_id FROM sync_state WHERE channel_id = c.id) AS last_history_id
    FROM channels c
    ORDER BY c.type, c.label
  `).all();

  const enriched = channels.map((c) => {
    const connected = c.type === 'email' ? isConnected(c.id) : false;
    const poll = c.type === 'email' ? getPollerState(c.id) : { has_error: false, error_message: null };
    return {
      ...c,
      is_connected: connected,
      has_error: !!poll.has_error,
      error_message: poll.error_message || null,
      poller_last_run_at: poll.last_run_at || null,
    };
  });
  res.json({ channels: enriched });
});

router.patch('/:id', (req, res) => {
  const allowed = ['label', 'is_active', 'config_json'];
  const sets = [];
  const params = { id: req.params.id };
  for (const k of allowed) {
    if (k in req.body) {
      sets.push(`${k} = @${k}`);
      params[k] = req.body[k];
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'no valid fields' });
  const result = db.prepare(`UPDATE channels SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (result.changes === 0) return res.status(404).json({ error: 'Channel not found' });
  res.json(db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id));
});

export default router;
