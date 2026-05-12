import { Router } from 'express';
import db from '../db/init.js';
import { getAuthUrl, handleCallback, isConnected, disconnect } from '../services/gmail-oauth.js';

const router = Router();

// GET /api/auth/gmail/connect/:channelId
router.get('/gmail/connect/:channelId', (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND type = ?').get(req.params.channelId, 'email');
  if (!channel) return res.status(404).json({ error: 'Email channel not found' });
  const url = getAuthUrl(req.params.channelId);
  res.json({ auth_url: url });
});

// GET /api/auth/status
router.get('/status', (_req, res) => {
  const channels = db.prepare(`SELECT id, type, label, account_email FROM channels WHERE type = 'email'`).all();
  const tokens = db.prepare(`SELECT channel_id, email FROM oauth_tokens`).all();
  const tokenMap = new Map(tokens.map((t) => [t.channel_id, t.email]));

  const accounts = channels.map((c) => ({
    ...c,
    is_connected: isConnected(c.id),
    connected_email: tokenMap.get(c.id) || null,
  }));
  res.json({ accounts });
});

// DELETE /api/auth/gmail/:channelId
router.delete('/gmail/:channelId', (req, res) => {
  disconnect(req.params.channelId);
  res.json({ ok: true, disconnected: req.params.channelId });
});

export default router;

// OAuth callback router (mounted op /auth — niet /api/auth — omdat Google daarheen redirect)
export const callbackRouter = Router();

callbackRouter.get('/gmail/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send(`<h1>OAuth error</h1><p>${error}</p>`);
  if (!code || !state) return res.status(400).send('Missing code or state');

  try {
    const result = await handleCallback(code, state);
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Verbonden</title>
      <style>body{font-family:Inter,system-ui;display:grid;place-items:center;height:100vh;background:#f8f9fa;margin:0}
      .card{background:white;padding:48px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);text-align:center;max-width:420px}
      h1{color:#16a34a;margin:0 0 12px}p{color:#6b7280;margin:8px 0}a{color:#3b82f6;text-decoration:none}</style></head>
      <body><div class="card">
        <h1>✅ Verbonden</h1>
        <p><strong>${result.email}</strong></p>
        <p>Account gekoppeld aan kanaal: <code>${result.channelId}</code></p>
        <p><a href="http://localhost:5173">← Terug naar dashboard</a></p>
        <script>setTimeout(()=>{window.location.href='http://localhost:5173'},2000)</script>
      </div></body></html>
    `);
  } catch (e) {
    console.error('OAuth callback error:', e);
    res.status(500).send(`<h1>OAuth callback failed</h1><pre>${e.message}</pre>`);
  }
});
