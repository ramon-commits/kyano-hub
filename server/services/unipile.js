// Unipile REST API client — unified messaging (WhatsApp, Instagram, LinkedIn)
// Docs: https://developer.unipile.com
import { getUnipileCreds, getConfig } from './app-config.js';

export function isConfigured() {
  const { apiKey, dsn } = getUnipileCreds();
  return !!(apiKey && dsn);
}

function baseUrl() {
  const { dsn } = getUnipileCreds();
  if (!dsn) throw new Error('Unipile DSN niet geconfigureerd');
  return dsn.replace(/\/$/, '');
}

// Unipile's API is af en toe traag; zonder timeout blijft een send-call eeuwig hangen
// en de frontend eindeloos in "Verzenden…". 20s dekt normale calls ruim.
const UNIPILE_TIMEOUT_MS = 20000;

async function callUnipile(method, path, { query, body } = {}) {
  const { apiKey, dsn } = getUnipileCreds();
  if (!apiKey || !dsn) throw new Error('Unipile niet geconfigureerd');

  const url = new URL(baseUrl() + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== '') url.searchParams.set(k, v);
    }
  }

  const headers = {
    'X-API-KEY': apiKey,
    'Accept': 'application/json',
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UNIPILE_TIMEOUT_MS);
  const init = { method, headers, signal: controller.signal };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let resp;
  try {
    resp = await fetch(url, init);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Unipile timeout (${UNIPILE_TIMEOUT_MS / 1000}s) — probeer opnieuw`);
    throw new Error(`Kan Unipile niet bereiken: ${e.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const text = await resp.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!resp.ok) {
    if (resp.status === 401) throw new Error('Unipile API key ongeldig of verlopen');
    if (resp.status === 404) throw new Error(`Unipile resource niet gevonden: ${path}`);
    throw new Error(`Unipile API error (${resp.status}): ${data?.message || data?.detail || text.slice(0, 200)}`);
  }

  return data;
}

// ===== Accounts =====
export async function listAccounts() {
  const data = await callUnipile('GET', '/api/v1/accounts');
  // Unipile retourneert { items: [...] } of een array
  const items = Array.isArray(data) ? data : (data?.items || []);
  return items.map((a) => ({
    id: a.id,
    type: a.type || a.provider, // WHATSAPP, INSTAGRAM, LINKEDIN, etc.
    name: a.name || a.username || a.id,
    status: a.sources?.[0]?.status || a.status || 'UNKNOWN',
    raw: a,
  }));
}

// ===== Chats =====
export async function listChats(accountId, { limit = 50, cursor = null } = {}) {
  const data = await callUnipile('GET', '/api/v1/chats', {
    query: { account_id: accountId, limit, cursor },
  });
  const items = Array.isArray(data) ? data : (data?.items || []);
  return { items, cursor: data?.cursor || null };
}

// ===== Messages binnen een chat =====
export async function getChatMessages(chatId, { limit = 50, cursor = null } = {}) {
  const data = await callUnipile('GET', `/api/v1/chats/${chatId}/messages`, {
    query: { limit, cursor },
  });
  const items = Array.isArray(data) ? data : (data?.items || []);
  return { items, cursor: data?.cursor || null };
}

// ===== Attendees van een chat (voor sender naam resolutie) =====
export async function getChatAttendees(chatId) {
  const data = await callUnipile('GET', `/api/v1/chats/${chatId}/attendees`);
  return Array.isArray(data) ? data : (data?.items || []);
}

// ===== Mark chat as read =====
// Best-effort: ÉÉN request (PATCH setReadStatus). Gooit nooit een fout.
//
// Historie: eerder probeerden we 4 endpoint-varianten per chat. Alle 4 faalden en dat
// gebeurde bij elke geopende chat → Unipile werd platgelegd, SSE viel weg, Chrome bevroor.
// Nu: 1 poging, harde 5s timeout, en een 24u faal-cache zodat een falende chat niet opnieuw
// wordt bestookt. Plus een kill-switch (app_config.disable_mark_read_sync = '1') om de
// hele sync direct uit te zetten zonder redeploy.
const failedMarkReadChats = new Map(); // chatId -> timestamp van laatste mislukking
const MARK_READ_FAIL_TTL = 86400000;   // 24u
const MARK_READ_ATTEMPT_TIMEOUT = 5000; // 5s per poging — voorkomt hangende fetches die opstapelen

export async function markChatAsRead(chatId) {
  if (!chatId || !isConfigured()) return { ok: false, reason: 'not_configured_or_no_chat' };

  // Kill-switch: hele sync uitgezet via config.
  if (getConfig('disable_mark_read_sync') === '1') return { ok: false, disabled: true };

  // Recent gefaald? Skip — niet opnieuw spammen.
  const lastFailed = failedMarkReadChats.get(chatId);
  if (lastFailed && (Date.now() - lastFailed) < MARK_READ_FAIL_TTL) {
    return { ok: false, cached: true, reason: 'recently_failed' };
  }

  const { apiKey } = getUnipileCreds();
  const headers = { 'X-API-KEY': apiKey, 'Accept': 'application/json', 'Content-Type': 'application/json' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MARK_READ_ATTEMPT_TIMEOUT);
  try {
    const r = await fetch(new URL(baseUrl() + `/api/v1/chats/${encodeURIComponent(chatId)}`), {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ action: 'setReadStatus', value: true }),
      signal: controller.signal,
    });
    if (r.ok) return { ok: true, status: r.status };
    failedMarkReadChats.set(chatId, Date.now());
    return { ok: false, status: r.status };
  } catch (e) {
    failedMarkReadChats.set(chatId, Date.now());
    return { ok: false, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// Ruim verlopen faal-cache entries op zodat de Map niet oneindig groeit.
setInterval(() => {
  const cutoff = Date.now() - MARK_READ_FAIL_TTL;
  for (const [id, ts] of failedMarkReadChats.entries()) {
    if (ts < cutoff) failedMarkReadChats.delete(id);
  }
}, 3600000).unref?.();

// ===== Archive/mute chat =====
// Best-effort: probeer eerst archive, dan mute. Beide via PATCH op de chat-resource.
export async function archiveChat(chatId) {
  if (!chatId || !isConfigured()) return { ok: false, reason: 'not_configured_or_no_chat' };
  const { apiKey } = getUnipileCreds();
  const headers = { 'X-API-KEY': apiKey, 'Accept': 'application/json', 'Content-Type': 'application/json' };
  const encoded = encodeURIComponent(chatId);
  const url = new URL(baseUrl() + `/api/v1/chats/${encoded}`);

  const attempts = [
    { label: 'PATCH is_archived', body: { is_archived: true } },
    { label: 'PATCH archived', body: { archived: true } },
    { label: 'PATCH is_muted', body: { is_muted: true } },
    { label: 'PATCH muted', body: { muted: true } },
  ];

  for (const a of attempts) {
    try {
      const r = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(a.body) });
      console.log(`[ARCHIVE-CHAT] chat=${chatId} ${a.label}: status=${r.status} ok=${r.ok}`);
      if (r.ok) return { ok: true, via: a.label };
      if (r.status === 401 || r.status === 403) return { ok: false, status: r.status, via: a.label };
    } catch (e) {
      console.log(`[ARCHIVE-CHAT] chat=${chatId} ${a.label}: fetch fail ${e.message}`);
    }
  }

  console.log(`[ARCHIVE-CHAT] chat=${chatId}: geen endpoint werkte`);
  return { ok: false, reason: 'no_endpoint_worked' };
}

// ===== Verstuur in bestaande chat =====
export async function sendMessage(chatId, text) {
  return await callUnipile('POST', `/api/v1/chats/${chatId}/messages`, {
    body: { text },
  });
}

// ===== Verstuur in bestaande chat met media (multipart/form-data) =====
// files: Array<{ buffer: Buffer, filename: string, mimetype: string }>
export async function sendMessageWithAttachments(chatId, text, files) {
  const { apiKey, dsn } = getUnipileCreds();
  if (!apiKey || !dsn) throw new Error('Unipile niet geconfigureerd');

  const url = new URL(baseUrl() + `/api/v1/chats/${chatId}/messages`);
  const form = new FormData();
  if (text) form.append('text', text);
  for (const f of files) {
    const blob = new Blob([f.buffer], { type: f.mimetype || 'application/octet-stream' });
    form.append('attachments', blob, f.filename || 'bestand');
  }

  // Media-uploads mogen langer duren dan tekst — ruimere timeout (40s).
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' },
      body: form,
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Unipile timeout (40s) — probeer opnieuw');
    throw new Error(`Kan Unipile niet bereiken: ${e.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const txt = await resp.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }

  if (!resp.ok) {
    if (resp.status === 401) throw new Error('Unipile API key ongeldig of verlopen');
    throw new Error(`Unipile media-send error (${resp.status}): ${data?.message || data?.detail || txt.slice(0, 200)}`);
  }
  return data;
}

// ===== Start nieuwe chat =====
export async function startNewChat(accountId, attendeeId, text) {
  return await callUnipile('POST', '/api/v1/chats', {
    body: { account_id: accountId, text, attendees_ids: [attendeeId] },
  });
}

// ===== Download attachment binary (WhatsApp/LinkedIn/Instagram media) =====
// Unipile geeft geen directe URLs maar serveert media via een download-endpoint.
// Probeert verschillende endpoint-varianten; geeft { buffer, mimeType } terug bij succes.
export async function getMessageAttachmentBinary(messageExternalId, attachmentId) {
  if (!messageExternalId || !attachmentId || !isConfigured()) return null;
  const { apiKey } = getUnipileCreds();
  const headers = { 'X-API-KEY': apiKey, 'Accept': '*/*' };

  const paths = [
    `/api/v1/messages/${encodeURIComponent(messageExternalId)}/attachments/${encodeURIComponent(attachmentId)}`,
    `/api/v1/messages/${encodeURIComponent(messageExternalId)}/attachment/${encodeURIComponent(attachmentId)}`,
    `/api/v1/attachments/${encodeURIComponent(attachmentId)}?message_id=${encodeURIComponent(messageExternalId)}`,
  ];

  for (const path of paths) {
    try {
      const url = new URL(baseUrl() + path);
      const r = await fetch(url, { headers });
      if (!r.ok) continue;
      const mimeType = r.headers.get('content-type') || 'application/octet-stream';
      const buf = Buffer.from(await r.arrayBuffer());
      return { buffer: buf, mimeType };
    } catch { /* probeer volgende */ }
  }
  return null;
}

// ===== User profile =====
export async function getAccountMe(accountId) {
  return await callUnipile('GET', '/api/v1/users/me', {
    query: { account_id: accountId },
  });
}

// Map Unipile provider type → lokaal channel.type
export function unipileTypeToChannel(type) {
  const t = (type || '').toUpperCase();
  if (t === 'WHATSAPP') return 'whatsapp';
  if (t === 'LINKEDIN') return 'linkedin';
  if (t === 'INSTAGRAM') return 'instagram';
  return null;
}

// Deep-link generator
export function deepLinkFor(type, identifier) {
  const t = (type || '').toLowerCase();
  if (t === 'whatsapp') {
    const clean = String(identifier || '').replace(/[^\d+]/g, '');
    return clean ? `https://wa.me/${clean.replace(/^\+/, '')}` : 'https://web.whatsapp.com';
  }
  if (t === 'instagram') return identifier ? `https://ig.me/m/${identifier}` : 'https://www.instagram.com/direct/inbox/';
  if (t === 'linkedin') return 'https://www.linkedin.com/messaging/';
  return null;
}
