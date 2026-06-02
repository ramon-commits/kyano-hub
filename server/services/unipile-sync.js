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
  // Slots dynamisch uit de DB halen (op id-volgorde) i.p.v. hardcoded — zo werkt
  // elk extra kanaal (wa-3, ig-2, …) automatisch zonder code-wijziging.
  const buckets = { whatsapp: [], linkedin: [], instagram: [] };
  for (const r of db.prepare("SELECT id, type FROM channels WHERE type IN ('whatsapp','linkedin','instagram') ORDER BY id").all()) {
    if (buckets[r.type]) buckets[r.type].push(r.id);
  }
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

// Normaliseer Unipile attachment shape — input kan per provider variëren
// (WhatsApp: { id, type, url, mimetype, file_size, file_name }; soms gewoon { url })
function normalizeAttachments(msg) {
  const raw = msg.attachments || msg.media || msg.files;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((a, idx) => {
    const mime = a.mimetype || a.mime_type || a.content_type || a.type || null;
    const urlField = a.url || a.download_url || a.media_url || a.preview_url || a.thumbnail_url || null;
    const filename = a.file_name || a.filename || a.name || null;
    const size = a.file_size || a.size || a.bytes || null;
    // Unipile type kan "img" / "video" / "audio" / "file" zijn (provider-specifiek), of een echte mime
    const kindRaw = (a.type || '').toLowerCase();
    let kind = null;
    if (kindRaw === 'img' || kindRaw === 'image' || /^image\//.test(mime || '')) kind = 'image';
    else if (kindRaw === 'video' || /^video\//.test(mime || '')) kind = 'video';
    else if (kindRaw === 'audio' || /^audio\//.test(mime || '')) kind = 'audio';
    else if (filename && /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(filename)) kind = 'image';
    else if (filename && /\.(mp4|mov|webm|m4v)$/i.test(filename)) kind = 'video';
    else if (filename && /\.(mp3|m4a|ogg|wav|opus)$/i.test(filename)) kind = 'audio';
    else kind = 'file';
    return {
      id: a.id || `${msg.id || 'msg'}-${idx}`,
      kind,            // 'image' | 'video' | 'audio' | 'file'
      mime,
      url: urlField,
      filename,
      size,
    };
  });
}

function mediaSnippet(attachments) {
  if (!attachments.length) return '';
  const kinds = new Set(attachments.map((a) => a.kind));
  if (kinds.size === 1) {
    const k = [...kinds][0];
    const n = attachments.length;
    if (k === 'image') return n === 1 ? '📷 Foto' : `📷 ${n} foto's`;
    if (k === 'video') return n === 1 ? '🎥 Video' : `🎥 ${n} video's`;
    if (k === 'audio') return n === 1 ? '🎵 Audio' : `🎵 ${n} audio`;
    return n === 1 ? '📎 Bestand' : `📎 ${n} bestanden`;
  }
  return `📎 ${attachments.length} bijlagen`;
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
  const attachments = normalizeAttachments(msg);
  const attachmentsJson = attachments.length ? JSON.stringify(attachments) : null;
  const baseSnippet = text
    ? text.slice(0, 200)
    : (attachments.length ? mediaSnippet(attachments) : '(leeg bericht)');

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
      body_text, deep_link, thread_id, status, priority, received_at, attachments_json
    ) VALUES (
      @id, @external_id, @channel_id, @contact_id, @direction, @subject, @snippet,
      @body_text, @deep_link, @thread_id, @status, 'medium', @received_at, @attachments_json
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
    attachments_json: attachmentsJson,
  });

  // Backfill: bericht bestond al maar zonder attachments_json — update als nieuwe data attachments heeft
  if (r.changes === 0) {
    if (attachmentsJson) {
      db.prepare(`
        UPDATE messages SET attachments_json = ?, snippet = COALESCE(NULLIF(body_text, ''), snippet, ?), updated_at = datetime('now')
        WHERE channel_id = ? AND external_id = ? AND (attachments_json IS NULL OR attachments_json = '')
      `).run(attachmentsJson, displaySnippet, channel.id, msg.id);
    }
    return { inserted: false };
  }

  // Auto-wake: alleen bij ECHTE nieuwe insert + alleen 'waiting' berichten. Snoozed
  // berichten zijn bewust uitgesteld door de gebruiker en worden alleen door de cron gewekt.
  if (r.changes > 0 && !out && contactId) {
    const wake = db.prepare(`
      UPDATE messages SET status = 'open', snoozed_until = NULL, updated_at = datetime('now')
      WHERE contact_id = ? AND status = 'waiting' AND id != ?
    `).run(contactId, id);
    if (wake.changes > 0) {
      console.log(`⚡ Woke ${wake.changes} waiting message(s) from ${chatContact.name} — new Unipile reply`);
    }
  }

  // Auto-done: outbound bericht binnen → markeer alleen ÉÉRDERE open inbound in deze thread als beantwoord.
  // Unipile retourneert berichten descending (nieuwste eerst), dus zonder timestamp-filter zou een outbound
  // óók nieuwere inbound auto-doneén die net daarvoor in dezelfde sync-batch zijn ingelezen.
  if (out && chat.id) {
    const openInboundRows = db.prepare(`
      SELECT id, contact_id FROM messages
      WHERE thread_id = ? AND direction = 'inbound' AND status = 'open' AND id != ?
        AND received_at < ?
    `).all(chat.id, id, receivedAt);

    if (openInboundRows.length) {
      const noteText = `Beantwoord via ${channelType === 'whatsapp' ? 'WhatsApp' : channelType}`;
      const upd = db.prepare(`
        UPDATE messages SET
          status = 'done', done_at = datetime('now'),
          done_category = 'replied', done_note = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      const logIns = db.prepare(`
        INSERT INTO interaction_logs (id, message_id, contact_id, action, channel_type, note, outcome)
        VALUES (?, ?, ?, 'replied', ?, ?, 'sent')
      `);
      for (const row of openInboundRows) {
        upd.run(noteText, row.id);
        try { logIns.run(uuid(), row.id, row.contact_id, channelType, noteText); }
        catch (e) { console.error('auto-done log fail:', e.message); }
      }
      console.log(`✅ Auto-done: ${openInboundRows.length} bericht(en) ouder dan ${receivedAt} in thread ${chat.id} (${noteText})`);
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

  // Safety margin: kijk 2 min terug. Een chat die rond de last-sync-tijd updates kreeg moet opnieuw
  // gecheckt worden, anders mist Unipile's eventual-consistency soms berichten op de grens.
  const SAFETY_MS = 2 * 60 * 1000;
  const cutoffMs = lastSyncAt ? lastSyncAt.getTime() - SAFETY_MS : null;

  for (const chat of chats) {
    // Pak de MAX van alle beschikbare timestamp-velden — Unipile gebruikt soms verschillende keys
    const candidates = [chat.timestamp, chat.updated_at, chat.last_message_at, chat.lastMessageAt]
      .filter(Boolean)
      .map((v) => new Date(v).getTime())
      .filter((t) => !isNaN(t));
    const chatUpdatedMs = candidates.length ? Math.max(...candidates) : null;

    // Skip alleen als we ECHT zeker zijn dat de chat niet veranderd is sinds (lastSync - 2min).
    // Bij geen timestamp / parse-fail / binnen safety-window: NIET skippen, laat dedup het werk doen.
    const shouldSkip = cutoffMs != null && chatUpdatedMs != null && chatUpdatedMs <= cutoffMs;
    if (DEBUG) {
      console.log(`[UNIPILE-SYNC] ${channelId} chat=${chat.name || chat.id?.slice(0,12)} updated=${chatUpdatedMs ? new Date(chatUpdatedMs).toISOString() : 'null'} skip=${shouldSkip}`);
    }
    if (shouldSkip) {
      skippedChats++;
      continue;
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
