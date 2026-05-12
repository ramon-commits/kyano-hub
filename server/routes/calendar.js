import { Router } from 'express';
import { listEvents, createEvent } from '../services/calendar.js';

const router = Router();

router.get('/events', async (req, res, next) => {
  try {
    const events = await listEvents({ from: req.query.from, to: req.query.to });
    res.json({ events });
  } catch (e) { next(e); }
});

router.post('/events', async (req, res, next) => {
  try {
    const result = await createEvent(req.body);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

export default router;
