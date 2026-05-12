import { Router } from 'express';
import db from '../db/init.js';
import { syncChannel, syncAll } from '../services/gmail-sync.js';
import { getAllPollerState } from '../services/gmail-poller.js';

const router = Router();

router.get('/status', (_req, res) => {
  const states = db.prepare(`
    SELECT s.*, c.label, c.type,
      (SELECT COUNT(*) FROM messages WHERE channel_id = c.id) AS message_count
    FROM channels c
    LEFT JOIN sync_state s ON s.channel_id = c.id
    WHERE c.is_active = 1
  `).all();

  const pollerState = getAllPollerState();
  const enriched = states.map((s) => {
    const ps = pollerState[s.channel_id] || {};
    return {
      ...s,
      has_error: ps.has_error || false,
      error_message: ps.error_message || null,
      poller_last_run_at: ps.last_run_at || null,
    };
  });
  res.json({ states: enriched });
});

router.post('/all', async (_req, res, next) => {
  try {
    const result = await syncAll();
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

router.post('/:channelId', async (req, res, next) => {
  try {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    if (channel.type !== 'email') {
      // Placeholder voor WhatsApp/etc
      db.prepare(`
        INSERT INTO sync_state (channel_id, last_sync_at) VALUES (?, datetime('now'))
        ON CONFLICT(channel_id) DO UPDATE SET last_sync_at = datetime('now')
      `).run(req.params.channelId);
      return res.json({ ok: true, channel_id: req.params.channelId, status: 'placeholder', message: 'WhatsApp sync komt in stap 9' });
    }

    const result = await syncChannel(req.params.channelId);
    res.json({ ok: true, channel_id: req.params.channelId, ...result });
  } catch (e) {
    const msg = e?.message || '';
    const isAuth = /401|invalid_grant|unauthorized/i.test(msg);
    const isNotConnected = /not connected|no OAuth tokens/i.test(msg);
    const needsReconnect = isAuth || isNotConnected;
    res.status(isAuth ? 401 : isNotConnected ? 400 : 500).json({
      ok: false,
      error: msg,
      needs_reconnect: needsReconnect,
    });
  }
});

export default router;
