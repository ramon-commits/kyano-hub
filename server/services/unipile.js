// Unipile REST API client — unified messaging (WhatsApp, Instagram, LinkedIn)
// Docs: https://developer.unipile.com
import { getUnipileCreds } from './app-config.js';

export function isConfigured() {
  const { apiKey, dsn } = getUnipileCreds();
  return !!(apiKey && dsn);
}

function baseUrl() {
  const { dsn } = getUnipileCreds();
  if (!dsn) throw new Error('Unipile DSN niet geconfigureerd');
  return dsn.replace(/\/$/, '');
}

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
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let resp;
  try {
    resp = await fetch(url, init);
  } catch (e) {
    throw new Error(`Kan Unipile niet bereiken: ${e.message}`);
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
// Best-effort: probeer 3 endpoint-varianten in volgorde. Gooit nooit een fout.
// Bij elke shape: 4xx (behalve 404/405) = stop met retry (echte fout); 404/405 = probeer volgende.
export async function markChatAsRead(chatId) {
  if (!chatId || !isConfigured()) return { ok: false, reason: 'not_configured_or_no_chat' };
  const { apiKey } = getUnipileCreds();
  const baseHeaders = { 'X-API-KEY': apiKey, 'Accept': 'application/json' };
  const jsonHeaders = { ...baseHeaders, 'Content-Type': 'application/json' };
  const encoded = encodeURIComponent(chatId);

  const attempts = [
    {
      label: 'PATCH /chats/{id} {action: setReadStatus}',
      method: 'PATCH',
      path: `/api/v1/chats/${encoded}`,
      headers: jsonHeaders,
      body: JSON.stringify({ action: 'setReadStatus', value: true }),
    },
    {
      label: 'PATCH /chats/{id} {seen: true}',
      method: 'PATCH',
      path: `/api/v1/chats/${encoded}`,
      headers: jsonHeaders,
      body: JSON.stringify({ seen: true }),
    },
    {
      label: 'PUT /chats/{id}/read',
      method: 'PUT',
      path: `/api/v1/chats/${encoded}/read`,
      headers: baseHeaders,
    },
    {
      label: 'POST /chats/{id}/read',
      method: 'POST',
      path: `/api/v1/chats/${encoded}/read`,
      headers: baseHeaders,
    },
  ];

  for (const a of attempts) {
    try {
      const r = await fetch(new URL(baseUrl() + a.path), {
        method: a.method,
        headers: a.headers,
        body: a.body,
      });
      if (r.ok) return { ok: true, via: a.label };
      // Definitieve fout (auth/permissions) → stop met retries, het fixt zich niet door een ander endpoint
      if (r.status === 401 || r.status === 403) {
        console.log(`Unipile mark-as-read ${r.status} voor chat ${chatId} (${a.label})`);
        return { ok: false, status: r.status, via: a.label };
      }
      // 404/405/422 etc → probeer de volgende shape
    } catch (e) {
      console.log(`Unipile mark-as-read fetch fail (${chatId}, ${a.label}): ${e.message}`);
    }
  }

  console.log(`Unipile mark-as-read: geen van de ${attempts.length} endpoint-varianten werkte voor chat ${chatId}`);
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

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Accept': 'application/json' },
      body: form,
    });
  } catch (e) {
    throw new Error(`Kan Unipile niet bereiken: ${e.message}`);
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
