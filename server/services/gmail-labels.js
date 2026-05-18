import { google } from 'googleapis';
import { getClient } from './gmail-oauth.js';

// Best-effort: markeer een Gmail message als gelezen (verwijder UNREAD label)
// Faalt stil als kanaal niet verbonden, external_id ontbreekt, of Gmail call faalt
export async function markAsReadInGmail(channelId, externalId) {
  if (!channelId || !externalId) return { ok: false, reason: 'missing_ids' };
  try {
    const client = getClient(channelId);
    if (!client) return { ok: false, reason: 'not_connected' };

    const gmail = google.gmail({ version: 'v1', auth: client });
    await gmail.users.messages.modify({
      userId: 'me',
      id: externalId,
      requestBody: { removeLabelIds: ['UNREAD'] },
    });
    return { ok: true };
  } catch (e) {
    console.error(`Gmail markAsRead failed (channel=${channelId} msg=${externalId}):`, e.message);
    return { ok: false, reason: 'api_error', error: e.message };
  }
}

// Best-effort: archiveer een Gmail message — verwijder uit INBOX (en UNREAD)
export async function archiveInGmail(channelId, externalId) {
  if (!channelId || !externalId) return { ok: false, reason: 'missing_ids' };
  try {
    const client = getClient(channelId);
    if (!client) return { ok: false, reason: 'not_connected' };

    const gmail = google.gmail({ version: 'v1', auth: client });
    await gmail.users.messages.modify({
      userId: 'me',
      id: externalId,
      requestBody: { removeLabelIds: ['INBOX', 'UNREAD'] },
    });
    return { ok: true };
  } catch (e) {
    console.error(`Gmail archive failed (channel=${channelId} msg=${externalId}):`, e.message);
    return { ok: false, reason: 'api_error', error: e.message };
  }
}

// Best-effort: markeer een Gmail message als SPAM (verplaatst naar Spam folder)
export async function markAsSpamInGmail(channelId, externalId) {
  if (!channelId || !externalId) return { ok: false, reason: 'missing_ids' };
  try {
    const client = getClient(channelId);
    if (!client) return { ok: false, reason: 'not_connected' };

    const gmail = google.gmail({ version: 'v1', auth: client });
    await gmail.users.messages.modify({
      userId: 'me',
      id: externalId,
      requestBody: {
        addLabelIds: ['SPAM'],
        removeLabelIds: ['INBOX', 'UNREAD'],
      },
    });
    return { ok: true };
  } catch (e) {
    console.error(`Gmail markAsSpam failed (channel=${channelId} msg=${externalId}):`, e.message);
    return { ok: false, reason: 'api_error', error: e.message };
  }
}
