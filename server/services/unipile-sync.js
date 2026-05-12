import { v4 as uuid } from 'uuid';
import db from '../db/init.js';
import { matchContact } from './contact-matcher.js';
import * as unipile from './unipile.js';

// Mapping helpers
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

// Auto-map Unipile accounts → lokale channels (eerste WA → wa-1, etc.)
function autoMapAccounts(accounts) {
  const buckets = { whatsapp: ['wa-1', 'wa-2'], linkedin: ['li-1'], instagram: ['ig-1'] };
  const used = new Set();
  // Hou rekening met bestaande mappings
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
    // Find first available channel ID for this type
    const availableSlot = buckets[channelType].find((id) => !used.has(id));
    if (!availableSlot) continue;
    setChannelUnipileAccount(availableSlot, acc.id);
    used.add(availableSlot);
    mapping[acc.id] = availableSlot;
    console.log(`🔗 Unipile: gekoppeld ${acc.type} (${acc.name || acc.id}) → ${availableSlot}`);
  }
  return mapping;
}

function detectDirection(msg, accountId) {
  // Unipile: msg.is_sender of msg.sender_id === me
  if (typeof msg.is_sender === 'boolean') return msg.is_sender ? 'outbound' : 'inbound';
  if (msg.from?.is_self) return 'outbound';
  return 'inbound';
}

function extractContactInfo(chat, msg, channelType) {
  // Probeer attendees uit chat te halen
  const attendees = chat.attendees || chat.participants || [];
  const other = attendees.find((a) => !a.is_self) || attendees[0];
  if (!other) {
    return {
      name: msg.sender?.name || msg.from?.name || null,
      email: null,
      phone: channelType === 'whatsapp' ? (msg.sender?.phone || msg.from?.phone || null) : null,
    };
  }
  return {
    name: other.name || other.full_name || null,
    email: other.email || null,
    phone: channelType === 'whatsapp' ? (other.phone || other.phone_number || other.id) : null,
  };
}

function timestampToISO(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}

function persistUnipileMessage(channel, chat, msg) {
  const channelType = channel.type;
  const direction = detectDirection(msg, channel.config_json);
  const contactInfo = extractContactInfo(chat, msg, channelType);

  let contactId = null;
  try {
    const c = matchContact(contactInfo);
    contactId = c?.id || null;
  } catch (e) { console.error('contact match failed:', e.message); }

  const text = msg.text || msg.body || msg.message || '';
  const snippet = text ? text.slice(0, 200) : (msg.attachments?.length ? '[📎 Bijlage]' : '(leeg bericht)');
  const isOutbound = direction === 'outbound';
  const status = isOutbound ? 'archived' : 'open';
  const receivedAt = timestampToISO(msg.timestamp || msg.created_at || msg.date);
  const deepLink = unipile.deepLinkFor(channelType, contactInfo.phone || contactInfo.name);

  const id = uuid();
  const r = db.prepare(`
    INSERT OR IGNORE INTO messages (
      id, external_id, channel_id, contact_id, direction, subject, snippet,
      body_text, deep_link, thread_id, status, priority, received_at
    ) VALUES (
      @id, @external_id, @channel_id, @contact_id, @direction, NULL, @snippet,
      @body_text, @deep_link, @thread_id, @status, 'medium', @received_at
    )
  `).run({
    id, external_id: msg.id, channel_id: channel.id, contact_id: contactId, direction,
    snippet, body_text: text, deep_link: deepLink, thread_id: chat.id, status, received_at: receivedAt,
  });

  if (r.changes === 0) return { inserted: false };

  // Auto-wake bij inbound nieuw bericht
  if (!isOutbound && contactId) {
    const wake = db.prepare(`
      UPDATE messages SET status = 'open', snoozed_until = NULL, updated_at = datetime('now')
      WHERE contact_id = ? AND status IN ('snoozed', 'waiting') AND id != ?
    `).run(contactId, id);
    if (wake.changes > 0) {
      console.log(`⚡ Woke ${wake.changes} snoozed/waiting message(s) from ${contactInfo.name || contactInfo.phone} — new Unipile reply`);
    }
  }

  return { inserted: true, message_id: id };
}

// Sync één Unipile-account naar zijn lokale channel
export async function syncUnipileAccount(channelId, unipileAccountId) {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!channel) throw new Error(`Channel ${channelId} not found`);

  const { items: chats } = await unipile.listChats(unipileAccountId, { limit: 30 });
  let inserted = 0;
  let errors = 0;

  for (const chat of chats) {
    try {
      const { items: messages } = await unipile.getChatMessages(chat.id, { limit: 50 });
      for (const msg of messages) {
        try {
          const r = persistUnipileMessage(channel, chat, msg);
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

  // Update sync state
  db.prepare(`
    INSERT INTO sync_state (channel_id, last_sync_at) VALUES (?, datetime('now'))
    ON CONFLICT(channel_id) DO UPDATE SET last_sync_at = datetime('now')
  `).run(channelId);

  return { channel_id: channelId, inserted, errors, chats_seen: chats.length };
}

// Sync alle Unipile accounts
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
