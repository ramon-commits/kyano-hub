import { Router } from 'express';

const router = Router();

const notImplemented = (label) => (_req, res) => {
  res.status(501).json({ error: `${label} komt in stap 11 (Claude AI integratie)`, code: 'NOT_IMPLEMENTED' });
};

router.post('/analyze-thread', notImplemented('AI thread analyse'));
router.post('/generate-reply', notImplemented('AI reply generatie'));
router.post('/ask', notImplemented('AI vraag'));

export default router;
