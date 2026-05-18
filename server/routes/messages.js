import { Router } from 'express';
import multer from 'multer';
import { google } from 'googleapis';
import db from '../db/init.js';
import { v4 as uuid } from 'uuid';
import { sendReply, sendNew } from '../services/gmail-send.js';
import { markAsReadInGmail, markAsSpamInGmail, archiveInGmail } from '../services/gmail-labels.js';
import { getClient } from '../services/gmail-oauth.js';
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
// Voor status='open' groeperen we per thread: 1 rij per conversatie met message_count.
// Voor andere statussen (done/snoozed/etc) blijven we per-message tonen (logboek detail).
router.get('/', (req, res) => {
  const { status, channel_type, channel_id, contact_id, search, priority } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  const groupByThread = status === 'open';

  // ===== Gegroepeerd: 1 rij per thread (inbox-view) =====
  if (groupByThread) {
    const where = ["m.status = 'open'"];
    const params = {};
    if (channel_type) { where.push('ch.type = @channel_type'); params.channel_type = channel_type; }
    if (channel_id) { where.push('m.channel_id = @channel_id'); params.channel_id = channel_id; }
    if (contact_id) { where.push('m.contact_id = @contact_id'); params.contact_id = contact_id; }
    if (priority) { where.push('m.priority = @priority'); params.priority = priority; }
    if (search) {
      where.push(`(m.snippet LIKE @search OR m.subject LIKE @search OR c.name LIKE @search OR m.done_note LIKE @search OR m.body_text LIKE @search)`);
      params.search = `%${search}%`;
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    // Stap 1 — vind voor elke thread de id van het laatste OPEN bericht (matched ook contact/channel filters)
    // We tellen tegelijk hoeveel open berichten er in die thread zitten.
    // De outer SELECT moet ORDER BY received_at DESC hebben — anders komt rows in SQLite-storage-order
    // (effectief UUID) terug en kan een latere `.slice(0,50)` complete kanalen overslaan op pagina 1.
    const latestSql = `
      SELECT
        m.id AS latest_id,
        m.received_at AS latest_received_at,
        COALESCE(m.thread_id, m.id) AS thread_key,
        COUNT(*) OVER (PARTITION BY COALESCE(m.thread_id, m.id)) AS thread_open_count,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(m.thread_id, m.id)
          ORDER BY m.received_at DESC
        ) AS rn
      FROM messages m
      LEFT JOIN contacts c ON c.id = m.contact_id
      LEFT JOIN channels ch ON ch.id = m.channel_id
      ${whereSql}
    `;
    const latestRows = db.prepare(`
      SELECT latest_id, thread_key, thread_open_count
      FROM (${latestSql})
      WHERE rn = 1
      ORDER BY latest_received_at DESC
    `).all(params);

    const total = latestRows.length;
    const pageRowsMeta = latestRows.slice(offset, offset + limit);

    if (pageRowsMeta.length === 0) {
      return res.json({ messages: [], total, limit, offset });
    }

    // Stap 2 — haal full message rows op voor deze laatste-ids
    const placeholders = pageRowsMeta.map((_, i) => `@id${i}`).join(', ');
    const idParams = Object.fromEntries(pageRowsMeta.map((r, i) => [`id${i}`, r.latest_id]));
    const fullRows = db.prepare(`${MESSAGE_SELECT} WHERE m.id IN (${placeholders})`).all(idParams);

    // Stap 3 — koppel thread_open_count en sorteer op received_at desc
    const countByLatest = new Map(pageRowsMeta.map((r) => [r.latest_id, r.thread_open_count]));
    const enriched = fullRows
      .map((r) => ({ ...r, message_count: countByLatest.get(r.id) || 1 }))
      .sort((a, b) => new Date(b.received_at) - new Date(a.received_at));

    return res.json({ messages: enriched, total, limit, offset });
  }

  // ===== Per-message (done/snoozed/archived/logboek) =====
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
    const useFts = (status === 'done');
    if (useFts) {
      const cleaned = String(search).replace(/[^\p{L}\p{N}\s@._-]/gu, ' ').trim();
      if (cleaned.length >= 2) {
        const ftsQuery = `"${cleaned.replace(/"/g, '""')}"*`;
        where.push('m.rowid IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH @ftsQuery)');
        params.ftsQuery = ftsQuery;
      } else {
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

// POST /api/messages/:id/mark-read — markeer extern als gelezen (Gmail label + Unipile chat)
router.post('/:id/mark-read', (req, res) => {
  const msg = db.prepare('SELECT id FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  markExternalRead(req.params.id);
  res.json({ ok: true });
});

// POST /api/messages/:id/report-spam — markeer email als spam bij Gmail + lokaal archiveren + blokkeren
router.post('/:id/report-spam', async (req, res) => {
  const msg = db.prepare(`
    SELECT m.id, m.external_id, m.channel_id, m.contact_id, m.thread_id,
           ch.type AS channel_type
    FROM messages m
    LEFT JOIN channels ch ON ch.id = m.channel_id
    WHERE m.id = ?
  `).get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (msg.channel_type !== 'email') {
    return res.status(400).json({ error: 'Spam melden alleen voor email' });
  }

  let gmailOk = false;
  if (msg.external_id && msg.channel_id) {
    const r = await markAsSpamInGmail(msg.channel_id, msg.external_id);
    gmailOk = !!r?.ok;
  }

  // Archiveer alle open berichten in de thread lokaal
  const threadIds = openIdsInThread(req.params.id);
  const archiveStmt = db.prepare(`UPDATE messages SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND status = 'open'`);
  let archived = 0;
  const tx = db.transaction(() => {
    for (const id of threadIds) archived += archiveStmt.run(id).changes;
  });
  tx();
  for (const id of threadIds) logInteraction(id, 'archived', 'Gemeld als spam');

  // Auto-blokkeer: gebruik patroon uit body of contact email
  let pattern = (req.body?.email_pattern || '').toString().trim();
  if (!pattern && msg.contact_id) {
    const c = db.prepare('SELECT email FROM contacts WHERE id = ?').get(msg.contact_id);
    if (c?.email) pattern = c.email;
  }
  if (pattern) {
    const lower = pattern.toLowerCase();
    const existing = db.prepare(`SELECT id FROM sender_rules WHERE lower(email_pattern) = ? AND rule = 'block'`).get(lower);
    if (!existing) {
      db.prepare(`INSERT INTO sender_rules (id, email_pattern, rule) VALUES (?, ?, 'block')`)
        .run(uuid(), lower);
    }
  }

  res.json({ ok: true, gmail_ok: gmailOk, archived, blocked_pattern: pattern || null });
});

// GET /api/messages/:id/thread-summary — basale samenvatting (zonder AI)
router.get('/:id/thread-summary', (req, res) => {
  const msg = db.prepare('SELECT id, thread_id FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  const threadKey = msg.thread_id || msg.id;
  // Voor berichten zonder thread_id: alleen het bericht zelf
  const whereSql = msg.thread_id
    ? `WHERE m.thread_id = ?`
    : `WHERE m.id = ?`;
  const params = msg.thread_id ? [msg.thread_id] : [msg.id];

  const rows = db.prepare(`
    SELECT m.id, m.subject, m.snippet, m.body_text, m.received_at, m.direction,
           m.status, m.attachments_json,
           c.id AS contact_id, c.name AS contact_name,
           c.avatar_initials AS contact_initials, c.avatar_color AS contact_color,
           ch.type AS channel_type, ch.label AS channel_label, ch.account_email AS channel_account
    FROM messages m
    LEFT JOIN contacts c ON c.id = m.contact_id
    LEFT JOIN channels ch ON ch.id = m.channel_id
    ${whereSql}
    ORDER BY m.received_at ASC
  `).all(...params);

  // Deelnemers — gebruik contact-id om uniek te zijn, val terug op naam
  const seen = new Map();
  for (const r of rows) {
    if (r.direction === 'outbound') continue;
    const key = r.contact_id || r.contact_name || r.channel_account || 'unknown';
    if (!seen.has(key)) {
      seen.set(key, {
        id: r.contact_id || null,
        name: r.contact_name || r.channel_account || 'Onbekend',
        initials: r.contact_initials || null,
        color: r.contact_color || null,
      });
    }
  }
  const participants = [...seen.values()];

  let attachmentCount = 0;
  for (const r of rows) {
    if (!r.attachments_json) continue;
    try {
      const arr = JSON.parse(r.attachments_json);
      if (Array.isArray(arr)) {
        attachmentCount += arr.filter((a) => !a.isInline).length;
      }
    } catch { /* ignore */ }
  }

  const inboundCount = rows.filter((r) => r.direction === 'inbound').length;
  const outboundCount = rows.filter((r) => r.direction === 'outbound').length;
  const firstMsg = rows[0] || null;
  const lastMsg = rows[rows.length - 1] || null;
  const subject = rows.find((r) => r.subject)?.subject || null;

  res.json({
    thread_key: threadKey,
    channel_type: lastMsg?.channel_type || null,
    channel_label: lastMsg?.channel_label || null,
    subject,
    participants,
    total_messages: rows.length,
    inbound_count: inboundCount,
    outbound_count: outboundCount,
    first_message_at: firstMsg?.received_at || null,
    last_message_at: lastMsg?.received_at || null,
    last_sender: lastMsg ? (lastMsg.direction === 'outbound' ? 'Jij' : lastMsg.contact_name || 'Onbekend') : null,
    last_snippet: lastMsg?.snippet ? lastMsg.snippet.slice(0, 200) : null,
    attachment_count: attachmentCount,
    has_attachments: attachmentCount > 0,
    // Placeholders voor stap 11 (AI):
    ai_summary: null,
    ai_status_items: null,
    ai_pending_actions: null,
  });
});

// GET /api/messages/:id/attachment/:attachmentId — proxy de bijlage via Gmail API
router.get('/:id/attachment/:attachmentId', async (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(msg.channel_id);
  if (!channel) return res.status(400).json({ error: 'Bericht heeft geen kanaal' });
  if (!msg.external_id) return res.status(400).json({ error: 'Bericht heeft geen external_id' });

  // Lees metadata uit attachments_json voor mime + filename (gedeeld door beide paden)
  let meta = null;
  try {
    const list = msg.attachments_json ? JSON.parse(msg.attachments_json) : [];
    meta = list.find((a) => a.id === req.params.attachmentId) || null;
  } catch { /* ignore */ }

  try {
    let buffer = null;
    let mimeType = null;
    let filename = (meta?.filename || meta?.file_name || 'attachment').replace(/[\r\n"]/g, '_');

    if (channel.type === 'email') {
      const client = getClient(msg.channel_id);
      if (!client) return res.status(400).json({ error: 'Email-kanaal niet verbonden' });

      const gmail = google.gmail({ version: 'v1', auth: client });
      const { data } = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: msg.external_id,
        id: req.params.attachmentId,
      });
      if (!data?.data) return res.status(404).json({ error: 'Bijlage niet gevonden bij Gmail' });

      buffer = Buffer.from(data.data, 'base64url');
      mimeType = meta?.mimeType || meta?.mime || 'application/octet-stream';
    } else if (['whatsapp', 'instagram', 'linkedin'].includes(channel.type)) {
      // Unipile: download de media binary via aparte endpoint
      const result = await unipile.getMessageAttachmentBinary(msg.external_id, req.params.attachmentId);
      if (!result) return res.status(404).json({ error: 'Bijlage niet gevonden bij Unipile' });
      buffer = result.buffer;
      mimeType = meta?.mime || meta?.mimeType || result.mimeType || 'application/octet-stream';
    } else {
      return res.status(400).json({ error: `Bijlages niet ondersteund voor kanaal-type ${channel.type}` });
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (e) {
    console.error('attachment fetch fail:', e.message);
    res.status(500).json({ error: e.message || 'Bijlage ophalen mislukt' });
  }
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

        // Auto-done op alle open berichten in dezelfde thread (UI biedt "Houd open" undo)
        const threadOpenIds = openIdsInThread(req.params.id);
        const upStmt = db.prepare(`
          UPDATE messages SET
            status = 'done', done_at = datetime('now'),
            done_category = 'replied', done_note = 'Beantwoord via Comm Hub',
            updated_at = datetime('now')
          WHERE id = ? AND status = 'open'
        `);
        let autoDoneCount = 0;
        for (const tid of threadOpenIds) {
          autoDoneCount += upStmt.run(tid).changes;
          logInteraction(tid, 'replied', 'Beantwoord via Comm Hub', 'sent');
        }
        markExternalReadBulk(threadOpenIds);

        return res.json({
          ok: true,
          message_id: localId,
          channel_type: original.channel_type,
          original_id: req.params.id,
          original_done: autoDoneCount > 0,
          thread_done_count: autoDoneCount,
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

    // Auto-done op alle open berichten in dezelfde thread (UI biedt "Houd open" undo)
    const threadOpenIds = openIdsInThread(req.params.id);
    const upStmt = db.prepare(`
      UPDATE messages SET
        status = 'done', done_at = datetime('now'),
        done_category = 'replied', done_note = 'Beantwoord via Comm Hub',
        updated_at = datetime('now')
      WHERE id = ? AND status = 'open'
    `);
    let autoDoneCount = 0;
    for (const tid of threadOpenIds) {
      autoDoneCount += upStmt.run(tid).changes;
      logInteraction(tid, 'replied', 'Beantwoord via Comm Hub', 'sent');
    }

    // Best-effort mark-as-read in het externe kanaal (Gmail/Unipile) voor de hele thread
    if (threadOpenIds.length) {
      markExternalReadBulk(threadOpenIds);
    } else if (original.external_id) {
      markAsReadInGmail(original.channel_id, original.external_id);
    }

    res.json({
      ok: true,
      message_id: localId,
      gmail_message_id: result.messageId,
      thread_id: result.threadId,
      from: result.fromEmail,
      original_id: req.params.id,
      original_done: autoDoneCount > 0,
      thread_done_count: autoDoneCount,
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

    // Auto-done op alle open berichten in dezelfde thread
    const threadOpenIds = openIdsInThread(req.params.id);
    const upStmt = db.prepare(`
      UPDATE messages SET
        status = 'done', done_at = datetime('now'),
        done_category = 'replied', done_note = 'Beantwoord via Comm Hub',
        updated_at = datetime('now')
      WHERE id = ? AND status = 'open'
    `);
    let autoDoneCount = 0;
    for (const tid of threadOpenIds) {
      autoDoneCount += upStmt.run(tid).changes;
      logInteraction(tid, 'replied', 'Beantwoord via Comm Hub', 'sent');
    }
    markExternalReadBulk(threadOpenIds);

    return res.json({
      ok: true,
      message_id: localId,
      channel_type: original.channel_type,
      attachments: localAttachments.length,
      original_id: req.params.id,
      original_done: autoDoneCount > 0,
      thread_done_count: autoDoneCount,
    });
  } catch (e) {
    if (e?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Bestand groter dan 10MB' });
    if (e?.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ error: 'Max 5 bestanden' });
    return res.status(500).json({ error: e.message || 'Upload mislukt' });
  }
});

// POST /api/messages/:id/forward — stuur een email door
router.post('/:id/forward', async (req, res, next) => {
  try {
    const original = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(req.params.id);
    if (!original) return res.status(404).json({ error: 'Message not found' });
    if (original.channel_type !== 'email') {
      return res.status(400).json({ error: 'Doorsturen is alleen beschikbaar voor email' });
    }

    const { to, cc, bcc, extra_text } = req.body || {};
    if (!to || typeof to !== 'string' || !to.trim()) {
      return res.status(400).json({ error: 'Aan-veld (to) is verplicht' });
    }

    const subject = (original.subject || '').replace(/^(Fwd?:\s*)+/i, '');
    const forwardSubject = `Fwd: ${subject || '(geen onderwerp)'}`;

    // Bouw quote: tekst + HTML versie
    const senderLine = original.contact_name && original.contact_email
      ? `${original.contact_name} <${original.contact_email}>`
      : (original.contact_email || original.contact_name || 'onbekend');
    const dateStr = original.received_at || '';
    const origText = original.body_text || (original.snippet || '');
    const origHtml = original.body_html || `<div>${escapeHtmlForForward(origText)}</div>`;

    const extra = (extra_text || '').toString();
    const headerLines = [
      '---------- Forwarded message ---------',
      `Van: ${senderLine}`,
      `Datum: ${dateStr}`,
      `Onderwerp: ${original.subject || '(geen onderwerp)'}`,
      `Aan: ${original.channel_account || ''}`,
      '',
    ];

    const bodyText = [
      extra,
      extra ? '' : null,
      ...headerLines,
      origText,
    ].filter((x) => x !== null).join('\n');

    const bodyHtml = `
      ${extra ? `<div>${escapeHtmlForForward(extra).replace(/\n/g, '<br>')}</div><br>` : ''}
      <div style="color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-bottom:12px">
        <div><strong>---------- Forwarded message ---------</strong></div>
        <div><strong>Van:</strong> ${escapeHtmlForForward(senderLine)}</div>
        <div><strong>Datum:</strong> ${escapeHtmlForForward(dateStr)}</div>
        <div><strong>Onderwerp:</strong> ${escapeHtmlForForward(original.subject || '(geen onderwerp)')}</div>
        <div><strong>Aan:</strong> ${escapeHtmlForForward(original.channel_account || '')}</div>
      </div>
      <blockquote style="margin:0;padding-left:12px;border-left:3px solid #d1d5db;color:#374151">
        ${origHtml}
      </blockquote>
    `.trim();

    const result = await sendNew(original.channel_id, {
      to: to.trim(),
      cc: cc || null,
      bcc: bcc || null,
      subject: forwardSubject,
      bodyHtml,
      bodyText,
    });

    // Lokaal opslaan als outbound
    const localId = uuid();
    db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, external_id, channel_id, contact_id, direction, subject, snippet,
        body_html, body_text, thread_id, status, priority, received_at
      ) VALUES (
        @id, @external_id, @channel_id, @contact_id, 'outbound', @subject, @snippet,
        @body_html, @body_text, @thread_id, 'archived', 'medium', @received_at
      )
    `).run({
      id: localId,
      external_id: result.messageId,
      channel_id: original.channel_id,
      contact_id: null,
      subject: forwardSubject,
      snippet: (extra || origText).trim().slice(0, 200),
      body_html: bodyHtml,
      body_text: bodyText,
      thread_id: result.threadId || null,
      received_at: new Date().toISOString(),
    });

    logInteraction(req.params.id, 'replied', `Doorgestuurd naar ${to}`, 'sent');

    res.json({
      ok: true,
      message_id: localId,
      gmail_message_id: result.messageId,
      from: result.fromEmail,
      to: to.trim(),
      original_id: req.params.id,
    });
  } catch (e) { next(e); }
});

function escapeHtmlForForward(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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

// PATCH /api/messages/:id/snooze — werkt op de hele thread (alle open berichten)
router.patch('/:id/snooze', (req, res) => {
  const { snoozed_until } = req.body;
  if (!snoozed_until) return res.status(400).json({ error: 'snoozed_until is required' });

  const ids = openIdsInThread(req.params.id);
  if (ids.length === 0) return res.status(404).json({ error: 'Message not found' });

  const stmt = db.prepare(`
    UPDATE messages SET status = 'snoozed', snoozed_until = ?, updated_at = datetime('now')
    WHERE id = ? AND status = 'open'
  `);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of ids) n += stmt.run(snoozed_until, id).changes;
    return n;
  });
  const changed = tx();
  if (changed === 0) {
    // Fallback: probeer ook niet-open status (compat met conversation view)
    const fb = db.prepare(`UPDATE messages SET status='snoozed', snoozed_until=?, updated_at=datetime('now') WHERE id=?`).run(snoozed_until, req.params.id);
    if (fb.changes === 0) return res.status(404).json({ error: 'Message not found' });
  }
  for (const id of ids) logInteraction(id, 'snoozed');
  res.json({ ok: true, id: req.params.id, status: 'snoozed', snoozed_until, thread_updated: changed });
});

// PATCH /api/messages/:id/done — werkt op hele thread (alle open berichten)
router.patch('/:id/done', (req, res) => {
  const { note, category } = req.body || {};
  const validCategories = ['replied', 'called', 'offer_sent', 'forwarded', 'not_relevant', 'other'];
  const finalCategory = validCategories.includes(category) ? category : 'other';

  const ids = openIdsInThread(req.params.id);
  if (ids.length === 0) return res.status(404).json({ error: 'Message not found' });

  const stmt = db.prepare(`
    UPDATE messages SET
      status = 'done', done_at = datetime('now'),
      done_note = ?, done_category = ?, updated_at = datetime('now')
    WHERE id = ? AND status = 'open'
  `);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of ids) n += stmt.run(note || null, finalCategory, id).changes;
    return n;
  });
  const changed = tx();
  if (changed === 0) {
    const fb = db.prepare(`
      UPDATE messages SET status='done', done_at=datetime('now'), done_note=?, done_category=?, updated_at=datetime('now')
      WHERE id=?
    `).run(note || null, finalCategory, req.params.id);
    if (fb.changes === 0) return res.status(404).json({ error: 'Message not found' });
  }
  for (const id of ids) logInteraction(id, 'done', note);
  markExternalReadBulk(ids);

  res.json({ ok: true, id: req.params.id, status: 'done', thread_updated: changed });
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

// POST /api/messages/bulk/snooze — elke id wordt geëxpandeerd naar zijn thread
router.post('/bulk/snooze', (req, res) => {
  const { ids, snoozed_until } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  if (!snoozed_until) return res.status(400).json({ error: 'snoozed_until is required' });

  const expanded = [...new Set(ids.flatMap((id) => openIdsInThread(id)))];
  const stmt = db.prepare(`UPDATE messages SET status = 'snoozed', snoozed_until = ?, updated_at = datetime('now') WHERE id = ? AND status = 'open'`);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of expanded) n += stmt.run(snoozed_until, id).changes;
    return n;
  });
  const updated = tx();
  logInteractionsBulk(expanded, 'snoozed');
  res.json({ ok: true, updated });
});

// POST /api/messages/bulk/done — elke id wordt geëxpandeerd naar zijn thread
router.post('/bulk/done', (req, res) => {
  const { ids, note, category } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  const validCategories = ['replied', 'called', 'offer_sent', 'forwarded', 'not_relevant', 'other'];
  const finalCategory = validCategories.includes(category) ? category : 'other';

  const expanded = [...new Set(ids.flatMap((id) => openIdsInThread(id)))];
  const stmt = db.prepare(`
    UPDATE messages SET status = 'done', done_at = datetime('now'), done_note = ?, done_category = ?, updated_at = datetime('now')
    WHERE id = ? AND status = 'open'
  `);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of expanded) n += stmt.run(note || null, finalCategory, id).changes;
    return n;
  });
  const updated = tx();

  markExternalReadBulk(expanded);
  logInteractionsBulk(expanded, 'done', note);
  res.json({ ok: true, updated });
});

// POST /api/messages/bulk/archive — elke id wordt geëxpandeerd naar zijn thread
router.post('/bulk/archive', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });

  const expanded = [...new Set(ids.flatMap((id) => openIdsInThread(id)))];
  const stmt = db.prepare(`UPDATE messages SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND status = 'open'`);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of expanded) n += stmt.run(id).changes;
    return n;
  });
  const updated = tx();
  logInteractionsBulk(expanded, 'archived');
  markExternalReadBulk(expanded, true);
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

// DELETE /api/messages/:id (soft delete -> archived) — werkt op hele thread (alle open berichten)
router.delete('/:id', (req, res) => {
  const ids = openIdsInThread(req.params.id);
  if (ids.length === 0) return res.status(404).json({ error: 'Message not found' });

  const stmt = db.prepare(`UPDATE messages SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND status = 'open'`);
  const tx = db.transaction(() => {
    let n = 0;
    for (const id of ids) n += stmt.run(id).changes;
    return n;
  });
  const changed = tx();
  if (changed === 0) {
    const fb = db.prepare(`UPDATE messages SET status='archived', updated_at=datetime('now') WHERE id=?`).run(req.params.id);
    if (fb.changes === 0) return res.status(404).json({ error: 'Message not found' });
  }
  for (const id of ids) logInteraction(id, 'archived');
  markExternalReadBulk(ids, true);
  res.json({ ok: true, id: req.params.id, status: 'archived', thread_updated: changed });
});

// Best-effort sync naar het externe kanaal (Gmail of Unipile).
// `seen` voorkomt dubbele Unipile-calls per thread.
// `shouldArchive=true` verwijdert het bericht óók uit Gmail INBOX / dempt de WA-chat.
function markExternalRead(messageId, seen = new Set(), shouldArchive = false) {
  const row = db.prepare(`
    SELECT m.external_id, m.channel_id, m.thread_id, ch.type
    FROM messages m
    LEFT JOIN channels ch ON ch.id = m.channel_id
    WHERE m.id = ?
  `).get(messageId);
  if (!row) return;
  if (row.type === 'email') {
    if (row.external_id) {
      if (shouldArchive) archiveInGmail(row.channel_id, row.external_id);
      else markAsReadInGmail(row.channel_id, row.external_id);
    }
    return;
  }
  if ((row.type === 'whatsapp' || row.type === 'instagram' || row.type === 'linkedin') && row.thread_id) {
    const key = `chat:${row.thread_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    unipile.markChatAsRead(row.thread_id).catch(() => { /* best-effort */ });
    if (shouldArchive) {
      unipile.archiveChat(row.thread_id).catch(() => { /* best-effort */ });
    }
  }
}

function markExternalReadBulk(messageIds, shouldArchive = false) {
  const seen = new Set();
  for (const id of messageIds) markExternalRead(id, seen, shouldArchive);
}

// Geef alle OPEN message-ids in dezelfde thread terug (inclusief het opgegeven id).
// Voor berichten zonder thread_id: alleen het bericht zelf.
function openIdsInThread(messageId) {
  const row = db.prepare('SELECT thread_id FROM messages WHERE id = ?').get(messageId);
  if (!row) return [];
  if (!row.thread_id) return [messageId];
  const ids = db
    .prepare(`SELECT id FROM messages WHERE thread_id = ? AND status = 'open'`)
    .all(row.thread_id)
    .map((r) => r.id);
  return ids.length ? ids : [messageId];
}

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
