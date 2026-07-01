// Laad .env uit de project root VOOR andere imports (encryption.js etc lezen process.env)
import './env.js';

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, statSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

import express from 'express';
import cors from 'cors';

import db, { DB_PATH } from './db/init.js';
import { seed, cleanupDemoData } from './db/seed.js';
import { startSnoozeCron } from './services/snooze-cron.js';
import { startPoller } from './services/poller.js';
import { startPurgeCron, purgeNow } from './services/purge-cron.js';
import { backfillAsanaContacts } from './services/asana-sync.js';
import { errorHandler, notFound } from './middleware/error-handler.js';

import messagesRouter from './routes/messages.js';
import contactsRouter from './routes/contacts.js';
import channelsRouter from './routes/channels.js';
import statsRouter from './routes/stats.js';
import authRouter, { callbackRouter } from './routes/auth.js';
import calendarRouter from './routes/calendar.js';
import syncRouter from './routes/sync.js';
import asanaRouter from './routes/asana.js';
import aiRouter from './routes/ai.js';
import exportRouter from './routes/export.js';
import settingsRouter from './routes/settings.js';
import eventsRouter from './routes/events.js';
import adminRouter from './routes/admin.js';
import quickRepliesRouter from './routes/quick-replies.js';
import socialRouter from './routes/social.js';

const PORT = parseInt(process.env.PORT) || 3001;

const app = express();

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  const channels = db.prepare('SELECT COUNT(*) AS n FROM channels').get().n;
  const messages = db.prepare('SELECT COUNT(*) AS n FROM messages').get().n;
  const contacts = db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n;
  res.json({ status: 'ok', db: 'connected', channels, messages, contacts, uptime_sec: Math.round(process.uptime()) });
});

// API routes
app.use('/api/messages', messagesRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/auth', authRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/sync', syncRouter);
app.use('/api/asana', asanaRouter);
app.use('/api/ai', aiRouter);
app.use('/api/export', exportRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/quick-replies', quickRepliesRouter);
app.use('/api/social', socialRouter);

// OAuth callback (Google redirect target — niet onder /api)
app.use('/auth', callbackRouter);

// Serve client build in production
const clientDist = resolve(__dirname, '../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api|\/auth).*/, (_req, res) => {
    res.sendFile(resolve(clientDist, 'index.html'));
  });
}

app.use('/api', notFound);
app.use(errorHandler);

// Boot
seed();
cleanupDemoData();

// One-shot cleanup: berichten die door de oude auto-wake bug (zie commit f4ae0ee)
// onterecht teruggezet zijn naar 'open' terwijl ze meerdere keren afgehandeld zijn.
// Heuristiek: status='open' + minstens 2 done/snoozed/archived logs → bug-slachtoffer.
// Marker in app_config voorkomt dat dit een legitieme reopen squasht bij volgende restart.
(function fixAutoWakeBugVictims() {
  const MARKER_KEY = 'autowake_cleanup_v1';
  const seen = db.prepare('SELECT value FROM app_config WHERE key = ?').get(MARKER_KEY);
  if (seen) return;

  const rows = db.prepare(`
    SELECT m.id,
      (SELECT COUNT(*) FROM interaction_logs il
        WHERE il.message_id = m.id AND il.action IN ('done', 'snoozed', 'archived')) AS times_handled
    FROM messages m
    WHERE m.status = 'open'
  `).all().filter((r) => r.times_handled >= 2);

  if (rows.length) {
    const fix = db.prepare(`
      UPDATE messages SET
        status = 'done', done_at = datetime('now'),
        done_category = 'replied',
        done_note = 'Auto-fixed: onterecht heropend door auto-wake bug',
        updated_at = datetime('now')
      WHERE id = ?
    `);
    const tx = db.transaction(() => { for (const r of rows) fix.run(r.id); });
    tx();
    console.log(`🧹 ${rows.length} bericht(en) hersteld: waren door de auto-wake bug onterecht heropend → terug op done`);
  }
  db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?)').run(MARKER_KEY, new Date().toISOString());
})();

// Eenmalige performance-cleanup: ruim oude body_html/body_text/logs op (tiered retention)
// en compacteer daarna de database met VACUUM. Gated op een app_config-marker zodat de
// relatief dure VACUUM maar één keer draait — daarna doet de purge-cron het onderhoud.
(function perfCleanupV1() {
  const MARKER_KEY = 'perf_cleanup_v1';
  const seen = db.prepare('SELECT value FROM app_config WHERE key = ?').get(MARKER_KEY);
  if (seen) return;
  try {
    const before = statSync(DB_PATH).size / 1048576;
    console.log(`🧹 Eenmalige performance-cleanup (database ${before.toFixed(1)} MB)…`);
    purgeNow();
    db.exec('VACUUM');
    db.pragma('wal_checkpoint(TRUNCATE)');
    const after = statSync(DB_PATH).size / 1048576;
    console.log(`🧹 Cleanup klaar — database ${before.toFixed(1)} MB → ${after.toFixed(1)} MB`);
    db.prepare('INSERT INTO app_config (key, value) VALUES (?, ?)').run(MARKER_KEY, new Date().toISOString());
  } catch (e) {
    console.error('Perf-cleanup faalde:', e.message);
  }
})();

// Eenmalige spam-cleanup: berichten die nu in de DB als open/snoozed staan maar in
// Gmail het SPAM-label hebben → archiveren. Draait async (blokkeert de boot niet) en
// is gegated op een app_config-marker zodat het maar één keer gebeurt.
(async function spamCleanupV1() {
  const MARKER_KEY = 'spam_cleanup_v1';
  if (db.prepare('SELECT value FROM app_config WHERE key = ?').get(MARKER_KEY)) return;

  try {
    const { google } = await import('googleapis');
    const { getClient } = await import('./services/gmail-oauth.js');
    const emailChannels = db.prepare("SELECT id FROM channels WHERE type = 'email'").all();
    console.log('🧹 Eenmalige spam-cleanup…');

    for (const ch of emailChannels) {
      try {
        const client = getClient(ch.id);
        if (!client) continue;
        const gmail = google.gmail({ version: 'v1', auth: client });

        const { data } = await gmail.users.messages.list({ userId: 'me', q: 'in:spam', maxResults: 500 });
        const spamIds = (data.messages || []).map((m) => m.id);
        if (spamIds.length === 0) continue;

        const placeholders = spamIds.map(() => '?').join(',');
        const result = db.prepare(`
          UPDATE messages SET status = 'archived', updated_at = datetime('now')
          WHERE channel_id = ? AND external_id IN (${placeholders})
            AND status IN ('open', 'snoozed', 'waiting')
        `).run(ch.id, ...spamIds);
        if (result.changes) console.log(`  ${ch.id}: ${result.changes} spam-bericht(en) gearchiveerd`);
      } catch (e) {
        console.log(`  ${ch.id}: spam-cleanup faalde: ${e.message}`);
      }
    }

    db.prepare("INSERT INTO app_config (key, value) VALUES (?, ?)").run(MARKER_KEY, new Date().toISOString());
  } catch (e) {
    console.error('Spam-cleanup faalde:', e.message);
  }
})();

startSnoozeCron();
startPoller();
startPurgeCron();

// Bestaande Asana-taken (gesynct vóór de contact-extractie) lokaal bijvullen zodat de
// uitklapbare "Neem contact op"-acties in de inbox meteen beschikbaar zijn.
try {
  const r = backfillAsanaContacts();
  if (r.updated) console.log(`📇 Asana contact-backfill: ${r.updated} taken bijgewerkt`);
} catch (e) {
  console.error('Asana contact-backfill faalde:', e.message);
}

app.listen(PORT, () => {
  console.log(`🚀 Kyano Comm Hub draait op http://localhost:${PORT}`);
  console.log(`   API:    http://localhost:${PORT}/api/health`);
  console.log(`   Client: http://localhost:5173 (start met "npm run dev")`);
});
