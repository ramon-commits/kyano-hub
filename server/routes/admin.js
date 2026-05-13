import { Router } from 'express';
import db from '../db/init.js';
import { syncAllUnipile } from '../services/unipile-sync.js';

const router = Router();

// POST /api/admin/resync-unipile
// Wist alle Unipile-channel berichten + orphaned contacts, dan opnieuw syncen.
// Nodig na het verbeteren van de extractie-logica (contactnamen, sender per bericht).
router.post('/resync-unipile', async (_req, res) => {
  try {
    // 1. Verzamel Unipile channel IDs (alles behalve email)
    const channels = db.prepare(`SELECT id FROM channels WHERE type IN ('whatsapp', 'linkedin', 'instagram')`).all();
    const ids = channels.map((c) => c.id);

    let deletedMsgs = 0;
    let deletedContacts = 0;

    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');

      // 2. Verwijder alle berichten van deze kanalen
      const r1 = db.prepare(`DELETE FROM messages WHERE channel_id IN (${placeholders})`).run(...ids);
      deletedMsgs = r1.changes;

      // 3. Reset sync_state voor deze kanalen (forceer full re-sync)
      db.prepare(`UPDATE sync_state SET last_sync_at = NULL, last_history_id = NULL, cursor = NULL
                  WHERE channel_id IN (${placeholders})`).run(...ids);

      // 4. Verwijder orphaned contacts (zonder berichten meer)
      const r2 = db.prepare(`
        DELETE FROM contacts
        WHERE id NOT IN (SELECT DISTINCT contact_id FROM messages WHERE contact_id IS NOT NULL)
      `).run();
      deletedContacts = r2.changes;
    }

    // 5. Trigger nieuwe sync
    const sync = await syncAllUnipile();

    res.json({
      ok: true,
      deleted_messages: deletedMsgs,
      deleted_orphaned_contacts: deletedContacts,
      resync: sync,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
