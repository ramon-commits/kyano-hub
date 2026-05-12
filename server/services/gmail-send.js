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

function buildMime({ from, to, cc, bcc, subject, bodyText, bodyHtml, inReplyTo, references }) {
  const boundary = makeBoundary();
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
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const plain = bodyText || (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, '').trim() : '');
  const html = bodyHtml || `<div>${escapeHtmlForFallback(plain)}</div>`;

  const parts = [
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    plain,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return headers.join('\r\n') + '\r\n' + parts;
}

function encodeBase64Url(input) {
  return Buffer.from(input, 'utf-8').toString('base64url');
}

// Verkrijg het authenticated account email voor From
async function getAccountFrom(client) {
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();
  return { name: data.name, email: data.email };
}

export async function sendReply(channelId, { threadId, to, cc, bcc, subject, bodyHtml, bodyText, inReplyTo, references }) {
  const client = getClient(channelId);
  if (!client) throw new Error(`Channel ${channelId} is not connected`);

  const me = await getAccountFrom(client);
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

export async function sendNew(channelId, { to, cc, bcc, subject, bodyHtml, bodyText }) {
  return sendReply(channelId, { threadId: null, to, cc, bcc, subject, bodyHtml, bodyText, inReplyTo: null, references: null });
}

export async function createDraft(channelId, { threadId, to, cc, bcc, subject, bodyHtml, bodyText, inReplyTo, references }) {
  const client = getClient(channelId);
  if (!client) throw new Error(`Channel ${channelId} is not connected`);

  const me = await getAccountFrom(client);
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
