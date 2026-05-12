import { Router } from 'express';
import db from '../db/init.js';
import { syncChannel, syncAll } from '../services/gmail-sync.js';
import { getAllPollerState } from '../services/poller.js';
import { syncAllUnipile, syncUnipileAccount } from '../services/unipile-sync.js';
import { isConfigured as unipileConfigured } from '../services/unipile.js';

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
    const gmail = await syncAll();
    let unipile = { total_new: 0, accounts_synced: 0, results: [] };
    if (unipileConfigured()) {
      try { unipile = await syncAllUnipile(); }
      catch (e) { unipile = { error: e.message, total_new: 0, accounts_synced: 0, results: [] }; }
    }
    res.json({
      ok: true,
      total_new: (gmail.total_new || 0) + (unipile.total_new || 0),
      accounts_synced: (gmail.accounts_synced || 0) + (unipile.accounts_synced || 0),
      results: [...(gmail.results || []), ...(unipile.results || [])],
    });
  } catch (e) { next(e); }
});

router.post('/unipile', async (_req, res, next) => {
  if (!unipileConfigured()) {
    return res.status(400).json({ ok: false, error: 'Unipile niet geconfigureerd', needs_setup: true });
  }
  try {
    const result = await syncAllUnipile();
    res.json({ ok: true, ...result });
  } catch (e) { next(e); }
});

router.post('/:channelId', async (req, res, next) => {
  try {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    if (channel.type !== 'email') {
      // Unipile channels (wa, ig, li)
      if (!unipileConfigured()) {
        return res.status(400).json({ ok: false, error: 'Unipile niet geconfigureerd', needs_setup: true });
      }
      let unipileAccountId = null;
      try { unipileAccountId = JSON.parse(channel.config_json || '{}').unipile_account_id || null; } catch { /* ignore */ }
      if (!unipileAccountId) {
        // Run general sync that auto-maps accounts
        const r = await syncAllUnipile();
        return res.json({ ok: true, channel_id: req.params.channelId, ...r });
      }
      const result = await syncUnipileAccount(channel.id, unipileAccountId);
      return res.json({ ok: true, ...result });
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
