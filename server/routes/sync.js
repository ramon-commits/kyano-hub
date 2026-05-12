import { Router } from 'express';
import db from '../db/init.js';

const router = Router();

router.get('/status', (_req, res) => {
  const states = db.prepare(`
    SELECT s.*, c.label, c.type FROM sync_state s
    LEFT JOIN channels c ON c.id = s.channel_id
  `).all();
  res.json({ states });
});

router.post('/:channelId', (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.channelId);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });
  // Placeholder — daadwerkelijke sync komt in stap 3 / 9
  db.prepare(`
    INSERT INTO sync_state (channel_id, last_sync_at) VALUES (?, datetime('now'))
    ON CONFLICT(channel_id) DO UPDATE SET last_sync_at = datetime('now')
  `).run(req.params.channelId);
  res.json({ ok: true, channel_id: req.params.channelId, status: 'placeholder', message: 'Echte sync komt in stap 3 (Gmail) / stap 9 (WhatsApp)' });
});

router.post('/all', (_req, res) => {
  const channels = db.prepare('SELECT id FROM channels WHERE is_active = 1').all();
  for (const c of channels) {
    db.prepare(`
      INSERT INTO sync_state (channel_id, last_sync_at) VALUES (?, datetime('now'))
      ON CONFLICT(channel_id) DO UPDATE SET last_sync_at = datetime('now')
    `).run(c.id);
  }
  res.json({ ok: true, synced: channels.length, status: 'placeholder' });
});

export default router;
