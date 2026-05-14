import { v4 as uuid } from 'uuid';
import db from '../db/init.js';
import { matchContact } from './contact-matcher.js';
import * as unipile from './unipile.js';

const DEBUG = process.env.UNIPILE_DEBUG === '1';

// ===== Mapping helpers =====
function getChannelByUnipileAccount(unipileAccountId) {
  const rows = db.prepare('SELECT * FROM channels WHERE config_json IS NOT NULL').all();
  for (const r of rows) {
    try {
      const cfg = JSON.parse(r.config_json || '{}');
      if (cfg.unipile_account_id === unipileAccountId) return r;
    } catch { /* skip */ }
  }
  return null;
}

function setChannelUnipileAccount(channelId, unipileAccountId) {
  const existing = db.prepare('SELECT config_json FROM channels WHERE id = ?').get(channelId);
  let cfg = {};
  try { cfg = existing?.config_json ? JSON.parse(existing.config_json) : {}; } catch { cfg = {}; }
  cfg.unipile_account_id = unipileAccountId;
  db.prepare('UPDATE channels SET config_json = ? WHERE id = ?').run(JSON.stringify(cfg), channelId);
}

function autoMapAccounts(accounts) {
  const buckets = { whatsapp: ['wa-1', 'wa-2'], linkedin: ['li-1'], instagram: ['ig-1'] };
  const used = new Set();
  for (const r of db.prepare("SELECT id, config_json FROM channels WHERE config_json IS NOT NULL").all()) {
    try {
      const cfg = JSON.parse(r.config_json);
      if (cfg.unipile_account_id) used.add(r.id);
    } catch { /* skip */ }
  }

  const mapping = {};
  for (const acc of accounts) {
    const channelType = unipile.unipileTypeToChannel(acc.type);
    if (!channelType || !buckets[channelType]) continue;
    if (getChannelByUnipileAccount(acc.id)) {
      mapping[acc.id] = getChannelByUnipileAccount(acc.id).id;
      continue;
    }
    const availableSlot = buckets[channelType].find((id) => !used.has(id));
    if (!availableSlot) continue;
    setChannelUnipileAccount(availableSlot, acc.id);
    used.add(availableSlot);
    mapping[acc.id] = availableSlot;
    console.log(`🔗 Unipile: gekoppeld ${acc.type} (${acc.name || acc.id}) → ${availableSlot}`);
  }
  return mapping;
}

// ===== Real Unipile field parsing (op basis van debug-logs) =====
//
// Chat object heeft:
//   - name: null (in 1:1) of de groepsnaam (in group chats)
//   - type: 0 (1:1) of !=0 (group)
//   - attendee_provider_id: opaque @lid id (1:1)
//   - attendee_public_identifier: phone in WA format "31xxxxx@s.whatsapp.net" (1:1)
//   - provider_id: zelfde phone (1:1)
//
// Message object heeft:
//   - is_sender: 0 of 1 (NIET boolean!)
//   - sender_id: opaque @lid id (zoals "45921823887470@lid")
//   - sender_attendee_id: opaque attendee uuid
//   - sender_public_identifier: phone "31xxxxx@s.whatsapp.net"
//   - text: bericht inhoud
//   - timestamp: ISO
//
// Voor groep chats: namen zitten in /api/v1/chats/{id}/attendees endpoint.

function isOutbound(msg) {
  // is_sender is numeriek (0 of 1)
  if (msg.is_sender === 1 || msg.is_sender === true) return true;
  if (msg.is_sender === 0 || msg.is_sender === false) return false;
  // Fallbacks voor andere shapes
  if (msg.from?.is_self === true) return true;
  if (msg.sender?.is_self === true) return true;
  if (msg.from_me === true) return true;
  return false;
}

// Trim WhatsApp suffix (@s.whatsapp.net of @lid) en LinkedIn (URN: prefix etc)
function cleanPhone(rawId) {
  if (!rawId || typeof rawId !== 'string') return null;
  // WhatsApp public_identifier: "31642602103@s.whatsapp.net"
  const m = rawId.match(/^(\d+)@s\.whatsapp\.net$/);
  if (m) return '+' + m[1];
  // WA @lid format (opaque LID) — geen telefoonnummer, return null
  if (rawId.endsWith('@lid')) return null;
  // LinkedIn opaque ID — geen phone
  if (rawId.startsWith('ACo')) return null;
  // Andere: alleen cijfers? gebruik als phone
  if (/^\+?\d{6,}$/.test(rawId)) return rawId.startsWith('+') ? rawId : ('+' + rawId);
  return null;
}

// Bouw een attendee-map { id → { name, phone } } voor naam-resolutie
async function buildAttendeeMap(chatId) {
  const map = new Map();
  try {
    const attendees = await unipile.getChatAttendees(chatId);
    if (DEBUG && attendees?.length) {
      console.log(`ATTENDEES voor chat ${chatId}:`, JSON.stringify(attendees, null, 2).slice(0, 2000));
    }
    for (const a of attendees) {
      const name = a.name || a.display_name || a.full_name || a.public_identifier || null;
      const phone = cleanPhone(a.public_identifier || a.provider_id);
      // Alle mogelijke IDs waar een message naar kan refereren:
      const keys = [a.id, a.provider_id, a.public_identifier, a.attendee_provider_id]
        .filter(Boolean);
      for (const k of keys) {
        map.set(k, { name, phone, isSelf: !!(a.is_self || a.is_me) });
      }
    }
  } catch (e) {
    if (DEBUG) console.warn(`Kon attendees niet ophalen voor chat ${chatId}:`, e.message);
  }
  return map;
}

// Sender info per bericht (resolved via attendee-map)
function resolveSender(msg, attendeeMap, isOut) {
  if (isOut) return { name: 'Ramon', phone: null, id: null };

  // Probeer alle mogelijke sender-IDs
  const candidates = [
    msg.sender_attendee_id,
    msg.sender_id,
    msg.sender_public_identifier,
    msg.sender?.id,
    msg.from?.id,
  ].filter(Boolean);

  for (const id of candidates) {
    const resolved = attendeeMap.get(id);
    if (resolved?.name) return { name: resolved.name, phone: resolved.phone, id };
  }

  // Fallback op cleanPhone uit sender_public_identifier
  const phone = cleanPhone(msg.sender_public_identifier);
  if (phone) return { name: phone, phone, id: msg.sender_id || null };

  // Laatste redmiddel: inline naam in msg.sender
  const inlineName = msg.sender?.name || msg.from?.name || msg.sender_name || null;
  if (inlineName) return { name: inlineName, phone: null, id: msg.sender_id || null };

  return { name: 'Onbekend', phone: null, id: msg.sender_id || null };
}

// Chat-level contact (= "wie is dit" voor inbox listing)
function resolveChatContact(chat, attendeeMap, channelType) {
  const isGroup = chat?.type !== 0 || (chat?.name && chat.name !== null);

  if (isGroup) {
    return {
      name: chat?.name || chat?.title || chat?.subject || `Groep (${[...attendeeMap.values()].filter((a) => !a.isSelf).length} deelnemers)`,
      phone: null,
      email: null,
      isGroup: true,
    };
  }

  // 1:1 chat → pak de niet-self attendee uit de map (heeft de profielnaam)
  for (const att of attendeeMap.values()) {
    if (!att.isSelf && att.name) {
      return {
        name: att.name,
        phone: channelType === 'whatsapp' ? att.phone : null,
        email: null,
        isGroup: false,
      };
    }
  }

  // Fallback: gebruik chat.attendee_public_identifier
  const fallbackPhone = cleanPhone(chat?.attendee_public_identifier);
  return {
    name: fallbackPhone || chat?.name || 'Onbekend',
    phone: channelType === 'whatsapp' ? fallbackPhone : null,
    email: null,
    isGroup: false,
  };
}

function timestampToISO(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  return new Date().toISOString();
}

function extractText(msg) {
  return msg.text || msg.body || msg.message || msg.content || msg.snippet || '';
}

function hasAttachments(msg) {
  const att = msg.attachments || msg.media || msg.files;
  return Array.isArray(att) && att.length > 0;
}

// ===== Persist =====
function persistUnipileMessage(channel, chat, msg, attendeeMap) {
  const channelType = channel.type;
  const out = isOutbound(msg);
  const sender = resolveSender(msg, attendeeMap, out);
  const chatContact = resolveChatContact(chat, attendeeMap, channelType);

  let contactId = null;
  try {
    const c = matchContact({
      email: chatContact.email,
      name: chatContact.name,
      phone: chatContact.phone,
    });
    contactId = c?.id || null;
  } catch (e) { console.error('contact match failed:', e.message); }

  const text = extractText(msg);
  const baseSnippet = text
    ? text.slice(0, 200)
    : (hasAttachments(msg) ? '[📎 Bijlage]' : '(leeg bericht)');

  // Voor inbound berichten in een groep: prefix snippet met sender naam
  const displaySnippet = (!out && chatContact.isGroup && sender.name && sender.name !== 'Onbekend')
    ? `${sender.name}: ${baseSnippet}`
    : baseSnippet;

  const status = out ? 'archived' : 'open';
  const receivedAt = timestampToISO(msg.timestamp || msg.created_at || msg.date || msg.sent_at);
  const deepLink = unipile.deepLinkFor(channelType, chatContact.phone || chatContact.name);

  // Per-message sender naam wordt opgeslagen in `subject` (anders ongebruikt voor chats)
  const senderNameForStorage = sender.name || (out ? 'Ramon' : 'Onbekend');

  const id = uuid();
  const r = db.prepare(`
    INSERT OR IGNORE INTO messages (
      id, external_id, channel_id, contact_id, direction, subject, snippet,
      body_text, deep_link, thread_id, status, priority, received_at
    ) VALUES (
      @id, @external_id, @channel_id, @contact_id, @direction, @subject, @snippet,
      @body_text, @deep_link, @thread_id, @status, 'medium', @received_at
    )
  `).run({
    id,
    external_id: msg.id,
    channel_id: channel.id,
    contact_id: contactId,
    direction: out ? 'outbound' : 'inbound',
    subject: senderNameForStorage,
    snippet: displaySnippet,
    body_text: text,
    deep_link: deepLink,
    thread_id: chat.id,
    status,
    received_at: receivedAt,
  });

  if (r.changes === 0) return { inserted: false };

  if (!out && contactId) {
    const wake = db.prepare(`
      UPDATE messages SET status = 'open', snoozed_until = NULL, updated_at = datetime('now')
      WHERE contact_id = ? AND status IN ('snoozed', 'waiting') AND id != ?
    `).run(contactId, id);
    if (wake.changes > 0) {
      console.log(`⚡ Woke ${wake.changes} snoozed/waiting message(s) from ${chatContact.name} — new Unipile reply`);
    }
  }

  // Auto-done: outbound bericht binnen → markeer open inbound in dezelfde thread als beantwoord
  if (out && chat.id) {
    const openInbound = db.prepare(`
      SELECT id, contact_id FROM messages
      WHERE thread_id = ? AND direction = 'inbound' AND status = 'open' AND id != ?
      ORDER BY received_at DESC LIMIT 1
    `).get(chat.id, id);

    if (openInbound) {
      const noteText = `Beantwoord via ${channelType === 'whatsapp' ? 'WhatsApp' : channelType}`;
      db.prepare(`
        UPDATE messages SET
          status = 'done', done_at = datetime('now'),
          done_category = 'replied', done_note = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(noteText, openInbound.id);
      try {
        db.prepare(`
          INSERT INTO interaction_logs (id, message_id, contact_id, action, channel_type, note, outcome)
          VALUES (?, ?, ?, 'replied', ?, ?, 'sent')
        `).run(uuid(), openInbound.id, openInbound.contact_id, channelType, noteText);
      } catch (e) { console.error('auto-done log fail:', e.message); }
      console.log(`✅ Auto-done: bericht ${openInbound.id} gemarkeerd als beantwoord (${noteText})`);
    }
  }

  return { inserted: true, message_id: id };
}

// Sync één Unipile-account
export async function syncUnipileAccount(channelId, unipileAccountId) {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!channel) throw new Error(`Channel ${channelId} not found`);

  const lastSyncRow = db.prepare('SELECT last_sync_at FROM sync_state WHERE channel_id = ?').get(channelId);
  const lastSyncAt = lastSyncRow?.last_sync_at ? new Date(lastSyncRow.last_sync_at.replace(' ', 'T') + 'Z') : null;

  const { items: chats } = await unipile.listChats(unipileAccountId, { limit: 30 });
  let inserted = 0;
  let errors = 0;
  let skippedChats = 0;

  for (const chat of chats) {
    const chatUpdatedRaw = chat.timestamp || chat.updated_at || chat.last_message_at;
    if (lastSyncAt && chatUpdatedRaw) {
      const chatUpdated = new Date(chatUpdatedRaw);
      if (!isNaN(chatUpdated.getTime()) && chatUpdated <= lastSyncAt) {
        skippedChats++;
        continue;
      }
    }

    try {
      // Bouw attendee-map (1 call per chat) voor naam-resolutie
      const attendeeMap = await buildAttendeeMap(chat.id);

      const { items: messages } = await unipile.getChatMessages(chat.id, { limit: 10 });
      for (const msg of messages) {
        try {
          const r = persistUnipileMessage(channel, chat, msg, attendeeMap);
          if (r.inserted) inserted++;
        } catch (e) {
          errors++;
          console.error('persist unipile msg failed:', e.message);
        }
      }
    } catch (e) {
      errors++;
      console.error(`Failed to fetch chat ${chat.id}:`, e.message);
    }
  }

  db.prepare(`
    INSERT INTO sync_state (channel_id, last_sync_at) VALUES (?, datetime('now'))
    ON CONFLICT(channel_id) DO UPDATE SET last_sync_at = datetime('now')
  `).run(channelId);

  return { channel_id: channelId, inserted, errors, chats_seen: chats.length, chats_skipped: skippedChats };
}

export async function syncAllUnipile() {
  if (!unipile.isConfigured()) {
    return { results: [], total_new: 0, accounts_synced: 0, skipped: 'not_configured' };
  }
  let accounts;
  try {
    accounts = await unipile.listAccounts();
  } catch (e) {
    return { results: [], total_new: 0, accounts_synced: 0, error: e.message };
  }
  const mapping = autoMapAccounts(accounts);

  const results = [];
  let total = 0;
  for (const acc of accounts) {
    const channelId = mapping[acc.id];
    if (!channelId) {
      results.push({ unipile_account_id: acc.id, type: acc.type, ok: false, reason: 'no_channel_slot' });
      continue;
    }
    try {
      const r = await syncUnipileAccount(channelId, acc.id);
      results.push({ ...r, ok: true, unipile_account_id: acc.id, type: acc.type });
      total += r.inserted;
    } catch (e) {
      results.push({ unipile_account_id: acc.id, channel_id: channelId, ok: false, error: e.message });
      console.error(`Unipile sync failed (${acc.id}):`, e.message);
    }
  }
  return { results, total_new: total, accounts_synced: results.length };
}
