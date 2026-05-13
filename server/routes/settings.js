import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db/init.js';
import { setConfig, getUnipileCreds } from '../services/app-config.js';
import * as unipile from '../services/unipile.js';

const router = Router();

// ===== Unipile =====
router.get('/unipile', (_req, res) => {
  const { apiKey, dsn } = getUnipileCreds();
  res.json({
    configured: !!(apiKey && dsn),
    has_api_key: !!apiKey,
    dsn: dsn || null, // DSN niet gevoelig, mag terug
  });
});

router.post('/unipile', async (req, res) => {
  const { api_key, dsn } = req.body || {};
  if (!api_key || !dsn) return res.status(400).json({ error: 'api_key en dsn zijn verplicht' });

  // Tijdelijk opslaan voor validatie
  setConfig('unipile_api_key', api_key);
  setConfig('unipile_dsn', dsn);

  try {
    const accounts = await unipile.listAccounts();
    res.json({ ok: true, configured: true, accounts });
  } catch (e) {
    // Rollback
    db.prepare("DELETE FROM app_config WHERE key IN ('unipile_api_key', 'unipile_dsn')").run();
    res.status(400).json({ ok: false, error: e.message, configured: false });
  }
});

router.delete('/unipile', (_req, res) => {
  db.prepare("DELETE FROM app_config WHERE key IN ('unipile_api_key', 'unipile_dsn')").run();
  res.json({ ok: true });
});

// ===== Sender rules =====
router.get('/sender-rules', (_req, res) => {
  const rules = db.prepare('SELECT * FROM sender_rules ORDER BY created_at DESC').all();
  res.json({ rules });
});

router.post('/sender-rules', (req, res) => {
  const { email_pattern, rule } = req.body || {};
  if (!email_pattern || !['allow', 'block', 'newsletter', 'info'].includes(rule)) {
    return res.status(400).json({ error: 'email_pattern en geldige rule zijn verplicht' });
  }
  const id = uuid();
  db.prepare(`INSERT INTO sender_rules (id, email_pattern, rule) VALUES (?, ?, ?)`)
    .run(id, email_pattern.toLowerCase(), rule);

  // Pas regel toe op bestaande berichten van deze afzender
  // Pattern '@domein.tld' = suffix-match (alle email-adressen van dat domein)
  // Pattern 'user@x.com'  = exact match (alleen deze afzender)
  if (rule === 'block' || rule === 'newsletter' || rule === 'info') {
    const lower = email_pattern.toLowerCase();
    if (lower.startsWith('@')) {
      db.prepare(`
        UPDATE messages SET status = 'archived', updated_at = datetime('now')
        WHERE status = 'open' AND contact_id IN (
          SELECT id FROM contacts WHERE lower(email) LIKE ?
        )
      `).run(`%${lower}`);
    } else {
      db.prepare(`
        UPDATE messages SET status = 'archived', updated_at = datetime('now')
        WHERE status = 'open' AND contact_id IN (
          SELECT id FROM contacts WHERE lower(email) = ?
        )
      `).run(lower);
    }
  }

  res.status(201).json({ ok: true, id, rule, email_pattern });
});

router.delete('/sender-rules/:id', (req, res) => {
  const r = db.prepare('DELETE FROM sender_rules WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Rule not found' });
  res.json({ ok: true });
});

export default router;
