import { Router } from 'express';
import { addClient, clientCount } from '../services/notification-bridge.js';

const router = Router();

// GET /api/events/stream — Server-Sent Events
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write('event: connected\ndata: {"ok":true}\n\n');
  addClient(res);
});

router.get('/status', (_req, res) => {
  res.json({ subscribers: clientCount() });
});

export default router;
