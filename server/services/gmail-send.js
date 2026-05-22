import { google } from 'googleapis';
import db from '../db/init.js';
import { getClient } from './gmail-oauth.js';

function rfc2822Date(date = new Date()) {
  return date.toUTCString().replace(/GMT$/, '+0000');
}

// Encode UTF-8 strings in headers per RFC 2047 (encoded-word)
function encodeHeader(value) {
  if (!value) return '';
  // ASCII-only: pass through
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
}

function makeBoundary(prefix = 'kyano') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureSubject(subject, isReply) {
  if (!subject) return isReply ? 'Re: (geen onderwerp)' : '(geen onderwerp)';
  if (isReply && !/^re:\s/i.test(subject)) return `Re: ${subject}`;
  return subject;
}

function escapeHtmlForFallback(text) {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// Encode een Buffer naar base64 in 76-char regels, zoals vereist door RFC 2045.
function encodeBase64Body(buffer) {
  return buffer.toString('base64').replace(/(.{76})/g, '$1\r\n').trim();
}

// Escape doublequotes en CR/LF in MIME-header parameter waarden (filenames).
function escapeMimeParam(value) {
  return (value || '').replace(/[\r\n"]/g, '_');
}

function buildMime({ from, to, cc, bcc, subject, bodyText, bodyHtml, inReplyTo, references, attachments }) {
  const innerBoundary = makeBoundary('alt');
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  const outerBoundary = hasAttachments ? makeBoundary('mix') : null;

  const headers = [];
  headers.push(`Date: ${rfc2822Date()}`);
  headers.push(`From: ${encodeHeader(from)}`);
  headers.push(`To: ${to}`);
  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);
  headers.push(`Subject: ${encodeHeader(subject)}`);
  headers.push('MIME-Version: 1.0');
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);
  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${outerBoundary}"`);
  } else {
    headers.push(`Content-Type: multipart/alternative; boundary="${innerBoundary}"`);
  }

  const plain = bodyText || (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, '').trim() : '');
  const html = bodyHtml || `<div>${escapeHtmlForFallback(plain)}</div>`;

  // multipart/alternative met de tekst- en HTML-versie van de body
  const altPart = [
    `--${innerBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    plain,
    '',
    `--${innerBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    '',
    `--${innerBoundary}--`,
  ].join('\r\n');

  if (!hasAttachments) {
    return headers.join('\r\n') + '\r\n\r\n' + altPart + '\r\n';
  }

  // multipart/mixed: het alternative-blok als eerste part, dan elke bijlage
  const mixedHead = [
    `--${outerBoundary}`,
    `Content-Type: multipart/alternative; boundary="${innerBoundary}"`,
    '',
    altPart,
    '',
  ].join('\r\n');

  const attachmentBlocks = attachments.map((att) => {
    const filename = escapeMimeParam(att.filename || 'bestand');
    const mime = att.mimeType || 'application/octet-stream';
    const body = encodeBase64Body(att.content);
    return [
      `--${outerBoundary}`,
      `Content-Type: ${mime}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      body,
      '',
    ].join('\r\n');
  });

  const closing = `--${outerBoundary}--\r\n`;

  return headers.join('\r\n') + '\r\n\r\n' + mixedHead + attachmentBlocks.join('') + closing;
}

function encodeBase64Url(input) {
  return Buffer.from(input, 'utf-8').toString('base64url');
}

// Verkrijg het authenticated account email voor From — gecached per channel (5 min)
const FROM_CACHE = new Map(); // channelId -> { name, email, fetchedAt }
const FROM_TTL_MS = 5 * 60 * 1000;

async function getAccountFrom(client, channelId) {
  if (channelId) {
    const cached = FROM_CACHE.get(channelId);
    if (cached && (Date.now() - cached.fetchedAt) < FROM_TTL_MS) {
      return { name: cached.name, email: cached.email };
    }
  }
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  if (channelId) FROM_CACHE.set(channelId, { name: data.name, email: data.email, fetchedAt: Date.now() });
  return { name: data.name, email: data.email };
}

export async function sendReply(channelId, { threadId, to, cc, bcc, subject, bodyHtml, bodyText, inReplyTo, references, attachments }) {
  const client = getClient(channelId);
  if (!client) throw new Error(`Channel ${channelId} is not connected`);

  const me = await getAccountFrom(client, channelId);
  const fromHeader = me.name ? `"${me.name}" <${me.email}>` : me.email;

  const raw = buildMime({
    from: fromHeader,
    to,
    cc,
    bcc,
    subject: ensureSubject(subject, true),
    bodyText,
    bodyHtml,
    inReplyTo,
    references,
    attachments,
  });

  const gmail = google.gmail({ version: 'v1', auth: client });
  const { data } = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodeBase64Url(raw),
      ...(threadId ? { threadId } : {}),
    },
  });

  return { messageId: data.id, threadId: data.threadId, labelIds: data.labelIds || [], fromEmail: me.email };
}

export async function sendNew(channelId, { to, cc, bcc, subject, bodyHtml, bodyText, attachments }) {
  return sendReply(channelId, { threadId: null, to, cc, bcc, subject, bodyHtml, bodyText, inReplyTo: null, references: null, attachments });
}

export async function createDraft(channelId, { threadId, to, cc, bcc, subject, bodyHtml, bodyText, inReplyTo, references }) {
  const client = getClient(channelId);
  if (!client) throw new Error(`Channel ${channelId} is not connected`);

  const me = await getAccountFrom(client, channelId);
  const fromHeader = me.name ? `"${me.name}" <${me.email}>` : me.email;

  const raw = buildMime({
    from: fromHeader,
    to, cc, bcc,
    subject: ensureSubject(subject, !!threadId),
    bodyText, bodyHtml, inReplyTo, references,
  });

  const gmail = google.gmail({ version: 'v1', auth: client });
  const { data } = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw: encodeBase64Url(raw),
        ...(threadId ? { threadId } : {}),
      },
    },
  });

  return { draftId: data.id, messageId: data.message?.id };
}
