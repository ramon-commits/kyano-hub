import { google } from 'googleapis';
import { v4 as uuid } from 'uuid';
import db from '../db/init.js';
import { getClient } from './gmail-oauth.js';
import { matchContact } from './contact-matcher.js';

const INITIAL_LIMIT = 100;
const BODY_MAX_BYTES = 500 * 1024; // 500 KB

// ===== Header helpers =====
function getHeader(headers, name) {
  if (!headers) return null;
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value || null;
}

function parseAddress(value) {
  if (!value) return { email: null, name: null };
  // "Display Name <email@example.com>" or "email@example.com"
  const m = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, '').trim() || null, email: m[2].trim().toLowerCase() };
  return { email: value.trim().toLowerCase(), name: null };
}

function parseAddressList(value) {
  if (!value) return [];
  // Naive split — okay for display, not for parsing nested groups
  return value.split(/,(?![^<]*>)/).map((p) => parseAddress(p)).filter((p) => p.email);
}

// ===== Body extraction =====
function findPart(parts, mimeType) {
  if (!parts) return null;
  for (const part of parts) {
    if (part.mimeType === mimeType && part.body?.data) return part;
    if (part.parts) {
      const found = findPart(part.parts, mimeType);
      if (found) return found;
    }
  }
  return null;
}

function decodeBody(data) {
  if (!data) return null;
  try {
    const buf = Buffer.from(data, 'base64url');
    if (buf.length > BODY_MAX_BYTES) {
      return buf.slice(0, BODY_MAX_BYTES).toString('utf-8') + '\n\n[… afgekapt op 500KB]';
    }
    return buf.toString('utf-8');
  } catch {
    return null;
  }
}

function extractBody(payload) {
  if (!payload) return { html: null, text: null };
  // Single-part
  if (!payload.parts && payload.body?.data) {
    if (payload.mimeType === 'text/html') return { html: decodeBody(payload.body.data), text: null };
    if (payload.mimeType === 'text/plain') return { html: null, text: decodeBody(payload.body.data) };
  }
  const htmlPart = findPart(payload.parts, 'text/html');
  const textPart = findPart(payload.parts, 'text/plain');
  return {
    html: htmlPart ? decodeBody(htmlPart.body.data) : null,
    text: textPart ? decodeBody(textPart.body.data) : null,
  };
}

// ===== Channel account index helpers =====
function getAccountIndex(channel) {
  try {
    const config = channel.config_json ? JSON.parse(channel.config_json) : null;
    return config?.gmail_account_index ?? null;
  } catch { return null; }
}

const DEFAULT_INDEX = { 'gmail-1': 0, 'gmail-2': 1, 'gmail-3': 2, 'gmail-4': 3 };

function deepLinkFor(channel, messageId) {
  const idx = getAccountIndex(channel) ?? DEFAULT_INDEX[channel.id] ?? 0;
  return `https://mail.google.com/mail/u/${idx}/#inbox/${messageId}`;
}

// Sender rule lookup: match op exact email of domein
function findSenderRule(senderEmail) {
  if (!senderEmail) return null;
  const lower = senderEmail.toLowerCase();
  const domain = lower.split('@')[1];
  const rule = db.prepare(`
    SELECT rule FROM sender_rules
    WHERE lower(email_pattern) = ? OR (? IS NOT NULL AND lower(email_pattern) = ?)
    LIMIT 1
  `).get(lower, domain || null, domain ? '@' + domain : '');
  return rule?.rule || null;
}

// ===== Persist a Gmail message =====
function persistMessage(channel, msg) {
  const payload = msg.payload || {};
  const headers = payload.headers || [];

  const fromRaw = getHeader(headers, 'From');
  const from = parseAddress(fromRaw);
  const subject = getHeader(headers, 'Subject') || null;
  const messageIdHeader = getHeader(headers, 'Message-ID') || getHeader(headers, 'Message-Id') || null;
  const inReplyTo = getHeader(headers, 'In-Reply-To') || null;

  const accountEmail = channel.account_email?.toLowerCase();
  const isOutbound = from.email && accountEmail && from.email === accountEmail;
  const direction = isOutbound ? 'outbound' : 'inbound';

  // Status afgeleid van labelIds:
  //   outbound → altijd 'archived' (al verzonden)
  //   inbound + UNREAD label → 'open' (komt in inbox)
  //   inbound zonder UNREAD → 'archived' (al gelezen in Gmail, niet meer actie nodig)
  const labelIds = Array.isArray(msg.labelIds) ? msg.labelIds : [];
  const isUnread = labelIds.includes('UNREAD');
  let status = isOutbound ? 'archived' : (isUnread ? 'open' : 'archived');

  // Sender rules: block / newsletter / info → forceer archived (of skip bij block)
  if (!isOutbound && from.email) {
    const senderRule = findSenderRule(from.email);
    if (senderRule === 'block') {
      // Skip — bericht wordt niet opgeslagen
      return { inserted: false, blocked: true };
    } else if (senderRule === 'newsletter' || senderRule === 'info') {
      status = 'archived';
    }
  }

  // Body
  const { html, text } = extractBody(payload);

  // Contact (voor inbound: afzender; voor outbound: eerste ontvanger)
  let contactEmail = from.email;
  let contactName = from.name;
  if (isOutbound) {
    const to = parseAddressList(getHeader(headers, 'To'))[0];
    contactEmail = to?.email || null;
    contactName = to?.name || null;
  }

  let contactId = null;
  if (contactEmail) {
    try {
      const c = matchContact({ email: contactEmail, name: contactName, phone: null });
      contactId = c?.id || null;
    } catch (e) {
      console.error('  contact match failed:', e.message);
    }
  }

  // received_at uit internalDate (ms epoch)
  const receivedAt = msg.internalDate
    ? new Date(parseInt(msg.internalDate, 10)).toISOString()
    : new Date().toISOString();

  const snippet = msg.snippet || (text ? text.slice(0, 200) : '') || subject || '(geen inhoud)';

  // Insert (OR IGNORE bij duplicate on channel_id+external_id unique index)
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO messages (
      id, external_id, channel_id, contact_id, direction, subject, snippet,
      body_html, body_text, deep_link, thread_id, in_reply_to,
      status, priority, received_at
    ) VALUES (
      @id, @external_id, @channel_id, @contact_id, @direction, @subject, @snippet,
      @body_html, @body_text, @deep_link, @thread_id, @in_reply_to,
      @status, 'medium', @received_at
    )
  `);

  const newId = uuid();
  const result = insertStmt.run({
    id: newId,
    external_id: msg.id,
    channel_id: channel.id,
    contact_id: contactId,
    direction,
    subject,
    snippet,
    body_html: html,
    body_text: text,
    deep_link: deepLinkFor(channel, msg.id),
    thread_id: msg.threadId || null,
    in_reply_to: inReplyTo,
    status,
    received_at: receivedAt,
  });

  if (result.changes === 0) {
    // Already existed — update body en metadata
    db.prepare(`
      UPDATE messages SET
        snippet = COALESCE(@snippet, snippet),
        subject = COALESCE(@subject, subject),
        body_html = COALESCE(@body_html, body_html),
        body_text = COALESCE(@body_text, body_text),
        thread_id = COALESCE(@thread_id, thread_id),
        contact_id = COALESCE(contact_id, @contact_id),
        updated_at = datetime('now')
      WHERE channel_id = @channel_id AND external_id = @external_id
    `).run({ snippet, subject, body_html: html, body_text: text, thread_id: msg.threadId, contact_id: contactId, channel_id: channel.id, external_id: msg.id });
    return { inserted: false, message_id: null, contact_id: contactId };
  }

  // Auto-wake snoozed messages from same contact (alleen bij inbound new message)
  let woken = 0;
  if (!isOutbound && contactId) {
    const wakeResult = db.prepare(`
      UPDATE messages SET status = 'open', snoozed_until = NULL, updated_at = datetime('now')
      WHERE contact_id = ? AND status IN ('snoozed', 'waiting') AND id != ?
    `).run(contactId, newId);
    woken = wakeResult.changes;
    if (woken > 0) {
      console.log(`⚡ Woke ${woken} snoozed/waiting message(s) from contact ${contactName || contactEmail} — new reply received`);
    }
  }

  return { inserted: true, message_id: newId, contact_id: contactId, woken };
}

// ===== Profile / historyId helpers =====
async function getProfile(client) {
  const gmail = google.gmail({ version: 'v1', auth: client });
  const { data } = await gmail.users.getProfile({ userId: 'me' });
  return data;
}

function updateSyncState(channelId, { historyId } = {}) {
  db.prepare(`
    INSERT INTO sync_state (channel_id, last_sync_at, last_history_id)
    VALUES (?, datetime('now'), ?)
    ON CONFLICT(channel_id) DO UPDATE SET
      last_sync_at = datetime('now'),
      last_history_id = COALESCE(excluded.last_history_id, sync_state.last_history_id)
  `).run(channelId, historyId || null);
}

// ===== Initial sync =====
async function initialSync(channel, client) {
  const gmail = google.gmail({ version: 'v1', auth: client });
  const profile = await getProfile(client);

  // Alleen ongelezen inbox-berichten — geen archief, geen gelezen, geen verzonden
  const { data: list } = await gmail.users.messages.list({
    userId: 'me',
    maxResults: INITIAL_LIMIT,
    q: 'is:unread label:inbox',
  });

  const messages = list.messages || [];
  let inserted = 0;
  let errors = 0;

  for (const ref of messages) {
    try {
      const { data: msg } = await gmail.users.messages.get({
        userId: 'me',
        id: ref.id,
        format: 'full',
      });
      const result = persistMessage(channel, msg);
      if (result.inserted) inserted++;
    } catch (e) {
      errors++;
      console.error(`  ❌ Failed to fetch message ${ref.id}:`, e.message);
    }
  }

  updateSyncState(channel.id, { historyId: profile.historyId });
  return { mode: 'initial', total_seen: messages.length, inserted, errors, history_id: profile.historyId };
}

// ===== Incremental sync via history.list =====
async function incrementalSync(channel, client, startHistoryId) {
  const gmail = google.gmail({ version: 'v1', auth: client });
  let inserted = 0;
  let errors = 0;
  let processed = 0;
  let latestHistoryId = startHistoryId;
  let pageToken;

  do {
    let resp;
    try {
      resp = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded', 'labelAdded', 'labelRemoved'],
        pageToken,
      });
    } catch (e) {
      // 404: history record te oud → val terug op initial sync
      if (e?.code === 404 || /history.*expired|invalid.*startHistoryId/i.test(e?.message || '')) {
        console.warn(`  ⚠️ History expired for ${channel.id}, falling back to initial sync`);
        return await initialSync(channel, client);
      }
      throw e;
    }

    const data = resp.data;
    latestHistoryId = data.historyId || latestHistoryId;

    const history = data.history || [];
    const seenIds = new Set();
    for (const h of history) {
      const added = h.messagesAdded || [];
      for (const a of added) {
        const id = a.message?.id;
        if (id && !seenIds.has(id)) seenIds.add(id);
      }
    }

    for (const mid of seenIds) {
      processed++;
      try {
        const { data: msg } = await gmail.users.messages.get({ userId: 'me', id: mid, format: 'full' });
        const result = persistMessage(channel, msg);
        if (result.inserted) inserted++;
      } catch (e) {
        errors++;
        console.error(`  ❌ Failed to fetch new message ${mid}:`, e.message);
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  updateSyncState(channel.id, { historyId: latestHistoryId });
  return { mode: 'incremental', processed, inserted, errors, history_id: latestHistoryId };
}

// ===== Public API =====
export async function syncChannel(channelId) {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND type = ?').get(channelId, 'email');
  if (!channel) throw new Error(`Channel ${channelId} not found or not an email channel`);

  const client = getClient(channelId);
  if (!client) throw new Error(`Channel ${channelId} is not connected (no OAuth tokens)`);

  const state = db.prepare('SELECT last_history_id FROM sync_state WHERE channel_id = ?').get(channelId);
  const startHistoryId = state?.last_history_id;

  if (!startHistoryId) {
    return await initialSync(channel, client);
  }
  try {
    return await incrementalSync(channel, client, startHistoryId);
  } catch (e) {
    console.error(`Incremental sync failed for ${channelId}:`, e.message);
    throw e;
  }
}

export async function syncAll() {
  const channels = db.prepare(`
    SELECT c.* FROM channels c
    INNER JOIN oauth_tokens t ON t.channel_id = c.id
    WHERE c.type = 'email' AND c.is_active = 1
  `).all();

  const results = [];
  let totalNew = 0;
  for (const channel of channels) {
    try {
      const r = await syncChannel(channel.id);
      results.push({ channel_id: channel.id, ok: true, ...r });
      totalNew += r.inserted || 0;
    } catch (e) {
      const isAuth = /401|invalid_grant|unauthorized/i.test(e?.message || '');
      console.error(`❌ Sync failed for ${channel.id}: ${e.message}${isAuth ? ' [AUTH ERROR — reconnect needed]' : ''}`);
      results.push({ channel_id: channel.id, ok: false, error: e.message, needs_reconnect: isAuth });
    }
  }

  return { results, total_new: totalNew, accounts_synced: channels.length };
}
