import { Router } from 'express';
import multer from 'multer';
import db from '../db/init.js';
import { v4 as uuid } from 'uuid';
import { sendReply, sendNew } from '../services/gmail-send.js';
import { markAsReadInGmail } from '../services/gmail-labels.js';
import { matchContact } from '../services/contact-matcher.js';
import * as unipile from '../services/unipile.js';

const router = Router();

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

function kindForMime(mime, filename) {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (filename && /\.(jpe?g|png|gif|webp)$/i.test(filename)) return 'image';
  if (filename && /\.(mp4|mov|webm)$/i.test(filename)) return 'video';
  if (filename && /\.(mp3|m4a|ogg|wav)$/i.test(filename)) return 'audio';
  return 'file';
}

const MESSAGE_SELECT = `
  SELECT
    m.*,
    c.name AS contact_name,
    c.company AS contact_company,
    c.email AS contact_email,
    c.phone AS contact_phone,
    c.avatar_initials AS contact_initials,
    c.avatar_color AS contact_color,
    ch.type AS channel_type,
    ch.label AS channel_label,
    ch.account_email AS channel_account
  FROM messages m
  LEFT JOIN contacts c ON c.id = m.contact_id
  LEFT JOIN channels ch ON ch.id = m.channel_id
`;

// GET /api/messages
router.get('/', (req, res) => {
  const { status, channel_type, channel_id, contact_id, search, priority } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  const where = [];
  const params = {};

  if (status) {
    if (status.includes(',')) {
      const list = status.split(',').map((s, i) => {
        params[`status${i}`] = s.trim();
        return `@status${i}`;
      }).join(',');
      where.push(`m.status IN (${list})`);
    } else {
      where.push('m.status = @status');
      params.status = status;
    }
  }
  if (channel_type) { where.push('ch.type = @channel_type'); params.channel_type = channel_type; }
  if (channel_id) { where.push('m.channel_id = @channel_id'); params.channel_id = channel_id; }
  if (contact_id) { where.push('m.contact_id = @contact_id'); params.contact_id = contact_id; }
  if (priority) { where.push('m.priority = @priority'); params.priority = priority; }

  if (search) {
    // FTS5 voor done-status (logboek) — alleen pure tekstmatch in snippet/subject/done_note
    // LIKE-fallback voor andere statussen of bij FTS errors
    const useFts = (status === 'done');
    if (useFts) {
      // Escape: vervang " met "" en wrap in quotes; voeg * voor prefix match
      const cleaned = String(search).replace(/[^\p{L}\p{N}\s@._-]/gu, ' ').trim();
      if (cleaned.length >= 2) {
        const ftsQuery = `"${cleaned.replace(/"/g, '""')}"*`;
        where.push('m.rowid IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH @ftsQuery)');
        params.ftsQuery = ftsQuery;
      } else {
        // Te kort voor FTS, fallback LIKE
        where.push(`(m.snippet LIKE @search OR m.subject LIKE @search OR c.name LIKE @search OR m.done_note LIKE @search)`);
        params.search = `%${search}%`;
      }
    } else {
      where.push(`(m.snippet LIKE @search OR m.subject LIKE @search OR c.name LIKE @search OR m.done_note LIKE @search OR m.body_text LIKE @search)`);
      params.search = `%${search}%`;
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `${MESSAGE_SELECT} ${whereSql} ORDER BY m.received_at DESC LIMIT @limit OFFSET @offset`;

  params.limit = limit;
  params.offset = offset;

  const rows = db.prepare(sql).all(params);

  const countSql = `SELECT COUNT(*) AS n FROM messages m LEFT JOIN contacts c ON c.id = m.contact_id LEFT JOIN channels ch ON ch.id = m.channel_id ${whereSql}`;
  const { limit: _l, offset: _o, ...countParams } = params;
  const total = db.prepare(countSql).get(countParams).n;

  res.json({ messages: rows, total, limit, offset });
});

// GET /api/messages/pinned — vastgezette gesprekken (1 row per thread, met laatste bericht)
router.get('/pinned', (req, res) => {
  const rows = db.prepare(`
    SELECT
      m.*,
      c.name AS contact_name,
      c.company AS contact_company,
      c.email AS contact_email,
      c.phone AS contact_phone,
      c.avatar_initials AS contact_initials,
      c.avatar_color AS contact_color,
      ch.type AS channel_type,
      ch.label AS channel_label,
      ch.account_email AS channel_account,
      p.pinned_at
    FROM pinned_threads p
    JOIN messages m ON m.id = (
      SELECT id FROM messages
      WHERE thread_id = p.thread_id
      ORDER BY received_at DESC
      LIMIT 1
    )
    LEFT JOIN contacts c ON c.id = m.contact_id
    LEFT JOIN channels ch ON ch.id = m.channel_id
    ORDER BY p.pinned_at DESC
    LIMIT 10
  `).all();
  res.json({ messages: rows, total: rows.length });
});

// POST /api/messages/:id/pin — pin de thread van dit bericht
router.post('/:id/pin', (req, res) => {
  const m = db.prepare('SELECT thread_id, channel_id, contact_id FROM messages WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Message not found' });
  if (!m.thread_id) return res.status(400).json({ error: 'Message has no thread_id (cannot pin)' });

  db.prepare(`
    INSERT INTO pinned_threads (thread_id, channel_id, contact_id) VALUES (?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET pinned_at = datetime('now')
  `).run(m.thread_id, m.channel_id, m.contact_id);
  res.json({ ok: true, thread_id: m.thread_id, pinned: true });
});

// DELETE /api/messages/:id/pin — unpin de thread van dit bericht
router.delete('/:id/pin', (req, res) => {
  const m = db.prepare('SELECT thread_id FROM messages WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Message not found' });
  const r = db.prepare('DELETE FROM pinned_threads WHERE thread_id = ?').run(m.thread_id);
  res.json({ ok: true, thread_id: m.thread_id, removed: r.changes });
});

// GET /api/messages/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Message not found' });
  res.json(row);
});

// GET /api/messages/:id/thread — alle berichten in dezelfde thread (lokaal uit DB)
router.get('/:id/thread', (req, res) => {
  const m = db.prepare('SELECT thread_id FROM messages WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Message not found' });
  if (!m.thread_id) {
    const single = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(req.params.id);
    return res.json({ messages: [single], thread_id: null });
  }
  const messages = db.prepare(`${MESSAGE_SELECT} WHERE m.thread_id = ? ORDER BY m.received_at ASC`).all(m.thread_id);
  res.json({ messages, thread_id: m.thread_id });
});

// POST /api/messages/:id/reply — verstuur een reply via Gmail API
router.post('/:id/reply', async (req, res, next) => {
  try {
    const original = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(req.params.id);
    if (!original) return res.status(404).json({ error: 'Message not found' });

    const { body_html, body_text, cc, bcc, body } = req.body || {};
    const plainBody = body_text ?? body ?? '';
    const htmlBody = body_html ?? (plainBody ? `<div>${plainBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>` : '');

    if (!plainBody && !htmlBody) return res.status(400).json({ error: 'body is required' });

    if (original.channel_type !== 'email') {
      // Unipile-pad: WhatsApp / Instagram / LinkedIn
      if (!unipile.isConfigured()) {
        return res.status(400).json({
          error: 'Unipile niet geconfigureerd — gebruik de deep-link of configureer Unipile in Instellingen',
          deep_link: original.deep_link,
          needs_setup: true,
        });
      }
      const chatId = original.thread_id;
      if (!chatId) return res.status(400).json({ error: 'Geen thread_id (chat) gevonden voor dit bericht' });
      try {
        const sent = await unipile.sendMessage(chatId, plainBody);
        const localId = uuid();
        db.prepare(`
          INSERT OR IGNORE INTO messages (
            id, external_id, channel_id, contact_id, direction, snippet, body_text,
            deep_link, thread_id, status, priority, received_at
          ) VALUES (
            @id, @external_id, @channel_id, @contact_id, 'outbound', @snippet, @body_text,
            @deep_link, @thread_id, 'archived', 'medium', @received_at
          )
        `).run({
          id: localId,
          external_id: sent?.id || sent?.message_id || `local-${localId}`,
          channel_id: original.channel_id,
          contact_id: original.contact_id,
          snippet: plainBody.slice(0, 200),
          body_text: plainBody,
          deep_link: original.deep_link,
          thread_id: chatId,
          received_at: new Date().toISOString(),
        });

        // Auto-done op het originele inbound bericht (de UI biedt een "Houd open" undo)
        const autoDone = db.prepare(`
          UPDATE messages SET
            status = 'done',
            done_at = datetime('now'),
            done_category = 'replied',
            done_note = 'Beantwoord via Comm Hub',
            updated_at = datetime('now')
          WHERE id = ? AND status != 'done'
        `).run(req.params.id);
        if (autoDone.changes > 0) {
          logInteraction(req.params.id, 'replied', 'Beantwoord via Comm Hub', 'sent');
        }

        return res.json({
          ok: true,
          message_id: localId,
          channel_type: original.channel_type,
          original_id: req.params.id,
          original_done: autoDone.changes > 0,
        });
      } catch (e) {
        return res.status(500).json({ error: e.message, deep_link: original.deep_link });
      }
    }

    const to = original.contact_email;
    if (!to) return res.status(400).json({ error: 'No contact email to reply to' });

    // Threading headers
    const inReplyTo = original.in_reply_to || null;
    // References: voor stap 3 simpel — gebruik in_reply_to als chain
    const references = inReplyTo;

    const result = await sendReply(original.channel_id, {
      threadId: original.thread_id,
      to,
      cc: cc || null,
      bcc: bcc || null,
      subject: original.subject || '(geen onderwerp)',
      bodyHtml: htmlBody,
      bodyText: plainBody,
      inReplyTo,
      references,
    });

    // Sla het verzonden bericht lokaal op (status='archived' voor outbound)
    const localId = uuid();
    const snippet = (plainBody || htmlBody.replace(/<[^>]+>/g, '')).trim().slice(0, 200);

    db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, external_id, channel_id, contact_id, direction, subject, snippet,
        body_html, body_text, deep_link, thread_id, in_reply_to,
        status, priority, received_at
      ) VALUES (
        @id, @external_id, @channel_id, @contact_id, 'outbound', @subject, @snippet,
        @body_html, @body_text, @deep_link, @thread_id, @in_reply_to,
        'archived', 'medium', @received_at
      )
    `).run({
      id: localId,
      external_id: result.messageId,
      channel_id: original.channel_id,
      contact_id: original.contact_id,
      subject: original.subject?.startsWith('Re:') ? original.subject : `Re: ${original.subject || '(geen onderwerp)'}`,
      snippet,
      body_html: htmlBody,
      body_text: plainBody,
      deep_link: original.deep_link,
      thread_id: result.threadId || original.thread_id,
      in_reply_to: original.external_id || null,
      received_at: new Date().toISOString(),
    });

    // Auto-done op het originele inbound bericht (UI biedt een "Houd open" undo)
    const autoDone = db.prepare(`
      UPDATE messages SET
        status = 'done',
        done_at = datetime('now'),
        done_category = 'replied',
        done_note = 'Beantwoord via Comm Hub',
        updated_at = datetime('now')
      WHERE id = ? AND status != 'done'
    `).run(req.params.id);
    if (autoDone.changes > 0) {
      logInteraction(req.params.id, 'replied', 'Beantwoord via Comm Hub', 'sent');
    }

    // Best-effort: ook in Gmail markeren als gelezen
    if (original.external_id) {
      markAsReadInGmail(original.channel_id, original.external_id);
    }

    res.json({
      ok: true,
      message_id: localId,
      gmail_message_id: result.messageId,
      thread_id: result.threadId,
      from: result.fromEmail,
      original_id: req.params.id,
      original_done: autoDone.changes > 0,
    });
  } catch (e) { next(e); }
});

// POST /api/messages/:id/reply-with-media — reply met bestanden (alleen Unipile-kanalen)
router.post('/:id/reply-with-media', mediaUpload.array('files', 5), async (req, res) => {
  try {
    const original = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(req.params.id);
    if (!original) return res.status(404).json({ error: 'Message not found' });

    const text = (req.body?.text || '').toString();
    const files = req.files || [];
    if (!text.trim() && files.length === 0) {
      return res.status(400).json({ error: 'tekst of minstens 1 bestand vereist' });
    }
    if (original.channel_type === 'email') {
      return res.status(400).json({ error: 'Email-bijlagen worden nog niet ondersteund via deze route' });
    }
    if (!unipile.isConfigured()) {
      return res.status(400).json({ error: 'Unipile niet geconfigureerd' });
    }
    const chatId = original.thread_id;
    if (!chatId) return res.status(400).json({ error: 'Geen thread_id (chat) gevonden voor dit bericht' });

    let sent;
    try {
      sent = await unipile.sendMessageWithAttachments(chatId, text, files.map((f) => ({
        buffer: f.buffer,
        filename: f.originalname,
        mimetype: f.mimetype,
      })));
    } catch (e) {
      return res.status(502).json({ error: e.message, deep_link: original.deep_link });
    }

    // Sla het verzonden bericht lokaal op met genormaliseerde attachments
    const localAttachments = files.map((f, idx) => ({
      id: `local-${idx}-${Date.now()}`,
      kind: kindForMime(f.mimetype, f.originalname),
      mime: f.mimetype,
      url: null, // Unipile-response geeft url's, maar de browser heeft die niet nodig: we tonen meteen
      filename: f.originalname,
      size: f.size,
    }));
    // Als de Unipile response wel URLs teruggeeft per attachment, gebruik die zodat we ze direct kunnen tonen
    if (Array.isArray(sent?.attachments)) {
      sent.attachments.forEach((a, idx) => {
        if (localAttachments[idx] && (a.url || a.download_url)) {
          localAttachments[idx].url = a.url || a.download_url;
        }
      });
    }

    const localId = uuid();
    const snippet = (text.trim() || `📎 ${files.length} bijlage${files.length === 1 ? '' : 'n'}`).slice(0, 200);

    db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, external_id, channel_id, contact_id, direction, snippet, body_text,
        deep_link, thread_id, status, priority, received_at, attachments_json
      ) VALUES (
        @id, @external_id, @channel_id, @contact_id, 'outbound', @snippet, @body_text,
        @deep_link, @thread_id, 'archived', 'medium', @received_at, @attachments_json
      )
    `).run({
      id: localId,
      external_id: sent?.id || sent?.message_id || `local-${localId}`,
      channel_id: original.channel_id,
      contact_id: original.contact_id,
      snippet,
      body_text: text,
      deep_link: original.deep_link,
      thread_id: chatId,
      received_at: new Date().toISOString(),
      attachments_json: JSON.stringify(localAttachments),
    });

    // Auto-done op het origineel (zelfde flow als gewone reply)
    const autoDone = db.prepare(`
      UPDATE messages SET
        status = 'done', done_at = datetime('now'),
        done_category = 'replied', done_note = 'Beantwoord via Comm Hub',
        updated_at = datetime('now')
      WHERE id = ? AND status != 'done'
    `).run(req.params.id);
    if (autoDone.changes > 0) {
      logInteraction(req.params.id, 'replied', 'Beantwoord via Comm Hub', 'sent');
    }

    return res.json({
      ok: true,
      message_id: localId,
      channel_type: original.channel_type,
      attachments: localAttachments.length,
      original_id: req.params.id,
      original_done: autoDone.changes > 0,
    });
  } catch (e) {
    if (e?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Bestand groter dan 10MB' });
    if (e?.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ error: 'Max 5 bestanden' });
    return res.status(500).json({ error: e.message || 'Upload mislukt' });
  }
});

// POST /api/messages/compose — nieuw bericht (geen reply)
router.post('/compose', async (req, res, next) => {
  try {
    const { channel_id, to, cc, bcc, subject, body_html, body_text } = req.body || {};
    if (!channel_id || !to || !(body_html || body_text)) {
      return res.status(400).json({ error: 'channel_id, to en body zijn verplicht' });
    }

    const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND type = ?').get(channel_id, 'email');
    if (!channel) return res.status(404).json({ error: 'Email channel not found' });

    const result = await sendNew(channel_id, {
      to,
      cc: cc || null,
      bcc: bcc || null,
      subject: subject || '(geen onderwerp)',
      bodyHtml: body_html || null,
      bodyText: body_text || null,
    });

    // Match contact en sla lokaal op
    const contact = matchContact({ email: to.split('<').pop().replace('>', '').trim(), name: null, phone: null });

    const localId = uuid();
    const snippet = (body_text || body_html?.replace(/<[^>]+>/g, '') || '').trim().slice(0, 200);

    db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, external_id, channel_id, contact_id, direction, subject, snippet,
        body_html, body_text, thread_id, status, priority, received_at
      ) VALUES (
        @id, @external_id, @channel_id, @contact_id, 'outbound', @subject, @snippet,
        @body_html, @body_text, @thread_id, 'archived', 'medium', @received_at
      )
    `).run({
      id: localId, external_id: result.messageId, channel_id, contact_id: contact?.id || null,
      subject: subject || '(geen onderwerp)', snippet, body_html, body_text,
      thread_id: result.threadId, received_at: new Date().toISOString(),
    });

    res.json({ ok: true, message_id: localId, gmail_message_id: result.messageId, thread_id: result.threadId, from: result.fromEmail });
  } catch (e) { next(e); }
});

// PATCH /api/messages/:id/snooze
router.patch('/:id/snooze', (req, res) => {
  const { snoozed_until } = req.body;
  if (!snoozed_until) return res.status(400).json({ error: 'snoozed_until is required' });

  const result = db.prepare(`
    UPDATE messages SET status = 'snoozed', snoozed_until = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(snoozed_until, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
  logInteraction(req.params.id, 'snoozed');
  res.json({ ok: true, id: req.params.id, status: 'snoozed', snoozed_until });
});

// PATCH /api/messages/:id/done
router.patch('/:id/done', (req, res) => {
  const { note, category } = req.body || {};
  const validCategories = ['replied', 'called', 'offer_sent', 'forwarded', 'not_relevant', 'other'];
  const finalCategory = validCategories.includes(category) ? category : 'other';

  const result = db.prepare(`
    UPDATE messages SET
      status = 'done',
      done_at = datetime('now'),
      done_note = ?,
      done_category = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(note || null, finalCategory, req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
  logInteraction(req.params.id, 'done', note);

  // Best-effort: markeer ook als gelezen in Gmail (alleen voor email berichten)
  const msg = db.prepare(`
    SELECT m.external_id, m.channel_id, ch.type FROM messages m
    LEFT JOIN channels ch ON ch.id = m.channel_id WHERE m.id = ?
  `).get(req.params.id);
  if (msg?.type === 'email' && msg.external_id) {
    markAsReadInGmail(msg.channel_id, msg.external_id); // fire-and-forget
  }

  res.json({ ok: true, id: req.params.id, status: 'done' });
});

// PATCH /api/messages/:id/waiting (wacht op reactie)
router.patch('/:id/waiting', (req, res) => {
  const result = db.prepare(`
    UPDATE messages SET status = 'waiting', snoozed_until = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
  logInteraction(req.params.id, 'snoozed');
  res.json({ ok: true, id: req.params.id, status: 'waiting' });
});

// PATCH /api/messages/:id/reopen
router.patch('/:id/reopen', (req, res) => {
  const result = db.prepare(`
    UPDATE messages SET
      status = 'open', snoozed_until = NULL, done_at = NULL, done_note = NULL, done_category = NULL,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
  logInteraction(req.params.id, 'opened', 'Heropend');
  res.json({ ok: true, id: req.params.id, status: 'open' });
});

// PATCH /api/messages/:id/priority
router.patch('/:id/priority', (req, res) => {
  const { priority } = req.body;
  if (!['high', 'medium', 'low'].includes(priority)) {
    return res.status(400).json({ error: 'priority must be high|medium|low' });
  }
  const result = db.prepare(`UPDATE messages SET priority = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(priority, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
  res.json({ ok: true, id: req.params.id, priority });
});

// POST /api/messages/bulk/snooze
router.post('/bulk/snooze', (req, res) => {
  const { ids, snoozed_until } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  if (!snoozed_until) return res.status(400).json({ error: 'snoozed_until is required' });

  const stmt = db.prepare(`UPDATE messages SET status = 'snoozed', snoozed_until = ?, updated_at = datetime('now') WHERE id = ?`);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of ids) n += stmt.run(snoozed_until, id).changes;
    return n;
  });
  const updated = tx();
  logInteractionsBulk(ids, 'snoozed');
  res.json({ ok: true, updated });
});

// POST /api/messages/bulk/done
router.post('/bulk/done', (req, res) => {
  const { ids, note, category } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  const validCategories = ['replied', 'called', 'offer_sent', 'forwarded', 'not_relevant', 'other'];
  const finalCategory = validCategories.includes(category) ? category : 'other';

  const stmt = db.prepare(`
    UPDATE messages SET status = 'done', done_at = datetime('now'), done_note = ?, done_category = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of ids) n += stmt.run(note || null, finalCategory, id).changes;
    return n;
  });
  const updated = tx();

  // Best-effort: markeer alle als gelezen in Gmail
  const emails = db.prepare(`
    SELECT m.external_id, m.channel_id FROM messages m
    LEFT JOIN channels ch ON ch.id = m.channel_id
    WHERE m.id IN (${ids.map(() => '?').join(',')}) AND ch.type = 'email' AND m.external_id IS NOT NULL
  `).all(...ids);
  for (const e of emails) markAsReadInGmail(e.channel_id, e.external_id);

  logInteractionsBulk(ids, 'done', note);
  res.json({ ok: true, updated });
});

// POST /api/messages/bulk/archive
router.post('/bulk/archive', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });

  const stmt = db.prepare(`UPDATE messages SET status = 'archived', updated_at = datetime('now') WHERE id = ?`);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of ids) n += stmt.run(id).changes;
    return n;
  });
  const updated = tx();
  logInteractionsBulk(ids, 'archived');
  res.json({ ok: true, updated, archived: updated });
});

// POST /api/messages/bulk/reopen — undo voor archive/snooze/done
router.post('/bulk/reopen', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });

  const stmt = db.prepare(`
    UPDATE messages SET
      status = 'open',
      snoozed_until = NULL,
      done_at = NULL,
      done_note = NULL,
      done_category = NULL,
      updated_at = datetime('now')
    WHERE id = ?
  `);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of ids) n += stmt.run(id).changes;
    return n;
  });
  const updated = tx();
  logInteractionsBulk(ids, 'opened', 'Heropend');
  res.json({ ok: true, updated, reopened: updated });
});

// DELETE /api/messages/:id (soft delete -> archived)
router.delete('/:id', (req, res) => {
  const result = db.prepare(`UPDATE messages SET status = 'archived', updated_at = datetime('now') WHERE id = ?`)
    .run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Message not found' });
  logInteraction(req.params.id, 'archived');
  res.json({ ok: true, id: req.params.id, status: 'archived' });
});

function logInteraction(messageId, action, note, outcome) {
  const msg = db.prepare('SELECT contact_id, channel_id FROM messages WHERE id = ?').get(messageId);
  if (!msg) return;
  const channelType = db.prepare('SELECT type FROM channels WHERE id = ?').get(msg.channel_id)?.type;
  try {
    db.prepare(`
      INSERT INTO interaction_logs (id, message_id, contact_id, action, channel_type, note, outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuid(), messageId, msg.contact_id, action, channelType, note || null, outcome || null);
  } catch (e) {
    console.error('Failed to log interaction:', e.message);
  }
}

function logInteractionsBulk(ids, action, note) {
  for (const id of ids) logInteraction(id, action, note);
}

export default router;
