import { Router } from 'express';
import db from '../db/init.js';
import { isConfigured, completeTask } from '../services/asana.js';

const router = Router();

// POST /api/asana/complete/:gid
// Vinkt de Asana-taak af (in Asana) én zet de bijbehorende hub-to-do direct op 'done',
// zodat de taak meteen uit de inbox verdwijnt. Wordt aangeroepen nadat er via de
// "Neem contact op"-kaart een bericht is verstuurd.
router.post('/complete/:gid', async (req, res, next) => {
  const gid = req.params.gid;
  if (!gid) return res.status(400).json({ error: 'gid is verplicht' });

  try {
    // Lokale to-do direct afsluiten (idempotent — herhaald aanroepen is veilig).
    db.prepare(`
      UPDATE messages
      SET status = 'done', done_at = datetime('now'),
          done_category = 'replied', done_note = 'Afgehandeld via Neem contact op',
          updated_at = datetime('now')
      WHERE channel_id = 'asana-1' AND external_id = ? AND status IN ('open', 'snoozed', 'waiting')
    `).run(gid);

    if (isConfigured()) {
      await completeTask(gid);
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
