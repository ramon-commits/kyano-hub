import { Router } from 'express';
import db from '../db/init.js';
import { getAuthUrl, handleCallback, isConnected, disconnect } from '../services/gmail-oauth.js';

const router = Router();

// Bepaal waar de gebruiker na OAuth naartoe moet. In productie serveert de server
// zélf de gebouwde client op dezelfde host/poort (bv. :3001), dus de request-host is
// correct. Voor een losse dev-setup (Vite op :5173) kun je CLIENT_URL overriden.
// (Referer werkt niet als signaal: op de OAuth-callback komt die van Google.)
function clientUrlFor(req) {
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/+$/, '');
  const host = req.get('host') || `localhost:${process.env.PORT || 3001}`;
  return `${req.protocol || 'http'}://${host}`;
}

// HTML pages
function renderPage({ title, headline, color, body, redirect = true, clientUrl = 'http://localhost:3001' }) {
  const redirectScript = redirect
    ? `<script>setTimeout(()=>{window.location.href=${JSON.stringify(clientUrl)}},5000)</script>`
    : '';
  return `<!DOCTYPE html>
<html lang="nl"><head><meta charset="UTF-8"><title>${title}</title>
<link rel="stylesheet" href="https://rsms.me/inter/inter.css">
<style>
  :root { --accent: #3b82f6; --bg: #f8f9fa; }
  html,body { margin:0; height:100%; font-family: Inter, system-ui, sans-serif; background: var(--bg); color: #111827; }
  .wrap { min-height:100%; display:grid; place-items:center; padding: 24px; }
  .card { background: white; padding: 40px; border-radius: 14px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); max-width: 480px; width: 100%; text-align: center; }
  .logo { width: 48px; height: 48px; border-radius: 10px; background: var(--accent); color: white; display: grid; place-items: center; margin: 0 auto 20px; font-weight: 700; font-size: 22px; }
  h1 { margin: 0 0 8px; font-size: 22px; color: ${color}; }
  p { margin: 6px 0; color: #6b7280; font-size: 14px; line-height: 1.5; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #374151; }
  .btn { display: inline-block; margin-top: 18px; padding: 10px 18px; background: var(--accent); color: white; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px; transition: background 0.15s; }
  .btn:hover { background: #2563eb; }
  .btn.secondary { background: white; color: #374151; border: 1px solid #e5e7eb; margin-left: 8px; }
  .btn.secondary:hover { background: #f9fafb; }
  .muted { color: #9ca3af; font-size: 12px; margin-top: 14px; }
</style></head>
<body><div class="wrap"><div class="card">
<div class="logo">K</div>
<h1>${headline}</h1>
${body}
${redirect ? '<div class="muted">Je wordt over 5 seconden teruggestuurd naar het dashboard…</div>' : ''}
</div></div>${redirectScript}</body></html>`;
}

// GET /api/auth/gmail/connect/:channelId — REDIRECT direct naar Google
router.get('/gmail/connect/:channelId', (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND type = ?').get(req.params.channelId, 'email');
  if (!channel) return res.status(404).send(renderPage({
    title: 'Kanaal niet gevonden',
    headline: 'Kanaal niet gevonden',
    color: '#dc2626',
    body: `<p>Geen email-kanaal met id <code>${req.params.channelId}</code>.</p>`,
    clientUrl: clientUrlFor(req),
  }));
  const url = getAuthUrl(req.params.channelId);
  // Accept-header: API clients (Accept: application/json) krijgen JSON, browsers krijgen redirect
  if (req.accepts(['html', 'json']) === 'json') {
    return res.json({ auth_url: url });
  }
  res.redirect(url);
});

// GET /api/auth/status — verrijkt met sync info
router.get('/status', (_req, res) => {
  const accounts = db.prepare(`
    SELECT
      c.id, c.type, c.label, c.account_email,
      t.email AS connected_email,
      (t.channel_id IS NOT NULL) AS is_connected,
      s.last_sync_at,
      s.last_history_id,
      (SELECT COUNT(*) FROM messages WHERE channel_id = c.id) AS message_count,
      (SELECT COUNT(*) FROM messages WHERE channel_id = c.id AND status = 'open') AS open_count
    FROM channels c
    LEFT JOIN oauth_tokens t ON t.channel_id = c.id
    LEFT JOIN sync_state s ON s.channel_id = c.id
    WHERE c.type = 'email'
  `).all().map((r) => ({
    id: r.id,
    type: r.type,
    label: r.label,
    account_email: r.account_email,
    is_connected: !!r.is_connected,
    connected_email: r.connected_email,
    last_sync_at: r.last_sync_at,
    has_history: !!r.last_history_id,
    message_count: r.message_count || 0,
    open_count: r.open_count || 0,
    has_error: false,
    error_message: null,
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
  const clientUrl = clientUrlFor(req);

  if (error) {
    const messages = {
      access_denied: { headline: '⚠️ Geen toegang gegeven', body: 'Je hebt het Google consent scherm geannuleerd. Geen toegang verleend.' },
      invalid_request: { headline: '❌ Ongeldig verzoek', body: 'Het OAuth-verzoek was ongeldig. Probeer opnieuw vanuit Instellingen.' },
    };
    const m = messages[error] || { headline: '❌ OAuth-fout', body: `Google gaf de fout: <code>${error}</code>` };
    return res.status(400).send(renderPage({
      title: 'OAuth fout',
      headline: m.headline,
      color: '#dc2626',
      body: `<p>${m.body}</p><a class="btn" href="${clientUrl}">Terug naar dashboard</a>`,
      clientUrl,
    }));
  }

  if (!code || !state) {
    return res.status(400).send(renderPage({
      title: 'OAuth fout',
      headline: '❌ Onvolledige callback',
      color: '#dc2626',
      body: `<p>Geen <code>code</code> of <code>state</code> ontvangen van Google. Probeer opnieuw te verbinden.</p>
             <a class="btn" href="${clientUrl}">Terug naar dashboard</a>`,
      clientUrl,
    }));
  }

  try {
    const result = await handleCallback(code, state);
    res.send(renderPage({
      title: 'Verbonden',
      headline: '✅ Verbonden!',
      color: '#16a34a',
      body: `<p><strong>${result.email}</strong> is gekoppeld aan kanaal <code>${result.channelId}</code>.</p>
             <p>Initiële sync gestart — binnen een minuut staan je laatste 100 berichten in de inbox.</p>
             <a class="btn" href="${clientUrl}">→ Naar dashboard</a>`,
      clientUrl,
    }));
  } catch (e) {
    console.error('OAuth callback error:', e);
    const msg = e?.message || '';
    const isExpired = /invalid_grant|code.*expired|code.*used/i.test(msg);
    const isConflict = /already.*connected/i.test(msg);
    let headline = '❌ Verbinden mislukt';
    let body = `<p>Er ging iets mis tijdens het opslaan van je tokens.</p><p><code>${msg.replace(/[<>]/g, '')}</code></p>`;
    if (isExpired) {
      headline = '⏰ Code verlopen';
      body = `<p>De Google authorization code is verlopen of al gebruikt. Probeer opnieuw te verbinden — codes zijn maar enkele minuten geldig.</p>`;
    } else if (isConflict) {
      headline = 'ℹ️ Account al verbonden';
      body = `<p>Dit account is al gekoppeld aan een ander kanaal in deze hub.</p>`;
    }
    res.status(500).send(renderPage({
      title: 'Verbinden mislukt',
      headline,
      color: '#dc2626',
      body: `${body}
             <a class="btn" href="${req.protocol || 'http'}://${req.get('host')}/api/auth/gmail/connect/${state}">Probeer opnieuw</a>
             <a class="btn secondary" href="${clientUrl}">Naar dashboard</a>`,
      clientUrl,
    }));
  }
});
