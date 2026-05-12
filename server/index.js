// Laad .env uit de project root VOOR andere imports (encryption.js etc lezen process.env)
import './env.js';

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

import express from 'express';
import cors from 'cors';

import db from './db/init.js';
import { seed, cleanupDemoData } from './db/seed.js';
import { startSnoozeCron } from './services/snooze-cron.js';
import { startPoller } from './services/poller.js';
import { startPurgeCron } from './services/purge-cron.js';
import { errorHandler, notFound } from './middleware/error-handler.js';

import messagesRouter from './routes/messages.js';
import contactsRouter from './routes/contacts.js';
import channelsRouter from './routes/channels.js';
import statsRouter from './routes/stats.js';
import authRouter, { callbackRouter } from './routes/auth.js';
import calendarRouter from './routes/calendar.js';
import syncRouter from './routes/sync.js';
import aiRouter from './routes/ai.js';
import exportRouter from './routes/export.js';
import settingsRouter from './routes/settings.js';
import eventsRouter from './routes/events.js';

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
app.use('/api/ai', aiRouter);
app.use('/api/export', exportRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/events', eventsRouter);

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
startSnoozeCron();
startPoller();
startPurgeCron();

app.listen(PORT, () => {
  console.log(`🚀 Kyano Comm Hub draait op http://localhost:${PORT}`);
  console.log(`   API:    http://localhost:${PORT}/api/health`);
  console.log(`   Client: http://localhost:5173 (start met "npm run dev")`);
});
