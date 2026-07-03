import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import db from '../db/init.js';

const router = Router();

const TEMPLATE_UPLOADS_DIR = path.resolve('data/template-attachments');
if (!fs.existsSync(TEMPLATE_UPLOADS_DIR)) fs.mkdirSync(TEMPLATE_UPLOADS_DIR, { recursive: true });

const templateUpload = multer({
  storage: multer.diskStorage({
    destination: TEMPLATE_UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

function normalizeShortcut(s) {
  if (!s) return s;
  const trimmed = String(s).trim();
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

// Genereer een unieke shortcut uit een titel wanneer er geen is opgegeven (shortcut is
// NOT NULL UNIQUE, maar in de UI optioneel). bijv. "Bedankt bericht" → /bedankt-bericht
function generateShortcut(title) {
  const base = '/' + String(title || 'template')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || '/template';
  let candidate = base;
  let n = 2;
  while (db.prepare('SELECT 1 FROM quick_replies WHERE shortcut = ?').get(candidate)) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

// GET /api/quick-replies — list (optioneel filter ?channel_type=email).
// Sortering: meest gebruikt eerst, dan alfabetisch op shortcut.
router.get('/', (req, res) => {
  const { channel_type } = req.query;
  let rows;
  if (channel_type && channel_type !== 'all') {
    rows = db.prepare(`
      SELECT * FROM quick_replies
      WHERE channel_type IS NULL OR channel_type = ?
      ORDER BY usage_count DESC, shortcut ASC
    `).all(channel_type);
  } else {
    rows = db.prepare(`SELECT * FROM quick_replies ORDER BY usage_count DESC, shortcut ASC`).all();
  }
  res.json({ quick_replies: rows, total: rows.length });
});

// GET /api/quick-replies/:id/full — template + bijlages (voor toepassen/bewerken)
router.get('/:id/full', (req, res) => {
  const t = db.prepare('SELECT * FROM quick_replies WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  t.attachments = db.prepare('SELECT id, filename, mime_type, file_size FROM template_attachments WHERE template_id = ?').all(t.id);
  res.json({ template: t });
});

// GET /api/quick-replies/:id/attachments
router.get('/:id/attachments', (req, res) => {
  const attachments = db.prepare('SELECT id, filename, mime_type, file_size FROM template_attachments WHERE template_id = ?').all(req.params.id);
  res.json({ attachments });
});

// POST /api/quick-replies/:id/attachments — upload bijlages
router.post('/:id/attachments', templateUpload.array('files', 10), (req, res) => {
  const templateId = req.params.id;
  const inserts = [];
  for (const file of req.files || []) {
    const id = uuid();
    db.prepare(`
      INSERT INTO template_attachments (id, template_id, filename, mime_type, file_size, file_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, templateId, file.originalname, file.mimetype, file.size, file.path);
    inserts.push({ id, filename: file.originalname, file_size: file.size, mime_type: file.mimetype });
  }
  res.json({ ok: true, attachments: inserts });
});

// GET /api/quick-replies/attachments/:id/download
router.get('/attachments/:id/download', (req, res) => {
  const att = db.prepare('SELECT * FROM template_attachments WHERE id = ?').get(req.params.id);
  if (!att) return res.status(404).json({ error: 'Not found' });
  res.download(att.file_path, att.filename);
});

// DELETE /api/quick-replies/attachments/:id
router.delete('/attachments/:id', (req, res) => {
  const att = db.prepare('SELECT * FROM template_attachments WHERE id = ?').get(req.params.id);
  if (att) {
    try { fs.unlinkSync(att.file_path); } catch { /* bestand al weg */ }
    db.prepare('DELETE FROM template_attachments WHERE id = ?').run(req.params.id);
  }
  res.json({ ok: true });
});

// POST /api/quick-replies — create (shortcut optioneel → wordt afgeleid van de titel)
router.post('/', (req, res) => {
  const { shortcut, title, body, body_html, channel_type, preferred_channel_id, subject, category } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ error: 'title en body zijn verplicht' });
  }
  const id = uuid();
  const finalShortcut = shortcut && String(shortcut).trim()
    ? normalizeShortcut(shortcut)
    : generateShortcut(title);
  try {
    db.prepare(`
      INSERT INTO quick_replies (id, shortcut, title, body, body_html, channel_type, preferred_channel_id, subject, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, finalShortcut, title, body, body_html || null, channel_type || null, preferred_channel_id || null, subject || null, category || 'algemeen');
    res.status(201).json({ ok: true, id, shortcut: finalShortcut });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: `Shortcut ${finalShortcut} bestaat al` });
    }
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/quick-replies/:id — update
router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM quick_replies WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { shortcut, title, body, body_html, channel_type, preferred_channel_id, subject, category } = req.body || {};
  // Lege shortcut in de UI → behoud de bestaande (nooit NULL wegschrijven).
  const finalShortcut = shortcut && String(shortcut).trim()
    ? normalizeShortcut(shortcut)
    : existing.shortcut;
  try {
    db.prepare(`
      UPDATE quick_replies SET
        shortcut = ?,
        title = COALESCE(?, title),
        body = COALESCE(?, body),
        body_html = ?,
        channel_type = ?,
        preferred_channel_id = ?,
        subject = ?,
        category = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      finalShortcut,
      title ?? null,
      body ?? null,
      body_html === undefined ? existing.body_html : (body_html || null),
      channel_type === undefined ? existing.channel_type : (channel_type || null),
      preferred_channel_id === undefined ? existing.preferred_channel_id : (preferred_channel_id || null),
      subject === undefined ? existing.subject : (subject || null),
      category === undefined ? existing.category : (category || 'algemeen'),
      req.params.id,
    );
    res.json({ ok: true, id: req.params.id });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: `Shortcut ${finalShortcut} bestaat al` });
    }
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/quick-replies/:id (verwijdert ook de bijlage-bestanden op schijf)
router.delete('/:id', (req, res) => {
  const atts = db.prepare('SELECT file_path FROM template_attachments WHERE template_id = ?').all(req.params.id);
  const r = db.prepare('DELETE FROM quick_replies WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM template_attachments WHERE template_id = ?').run(req.params.id);
  for (const a of atts) { try { fs.unlinkSync(a.file_path); } catch { /* al weg */ } }
  res.json({ ok: true, deleted: req.params.id });
});

// POST /api/quick-replies/:id/use — gebruiksteller ophogen (sortering "meest gebruikt")
router.post('/:id/use', (req, res) => {
  const r = db.prepare('UPDATE quick_replies SET usage_count = usage_count + 1 WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
