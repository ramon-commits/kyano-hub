import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import Avatar from '../shared/Avatar.jsx';
import { formatDateTime, parseDateSafe } from '../../lib/utils.js';
import { cn } from '../../lib/utils.js';

// Force all links in email HTML to open in a new tab with rel=noopener
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

function sanitize(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  });
}

function parseAttachments(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input !== 'string') return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// Vervang cid: references in HTML door de attachment-proxy URL
function replaceCidImages(html, messageId, attachments) {
  if (!html || !attachments?.length) return html;
  let result = html;
  for (const att of attachments) {
    if (!att.contentId || !att.id) continue;
    const cid = att.contentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // regex escape
    const re = new RegExp(`src=["']cid:${cid}["']`, 'gi');
    result = result.replace(re, `src="/api/messages/${encodeURIComponent(messageId)}/attachment/${encodeURIComponent(att.id)}"`);
  }
  return result;
}

function formatFileSize(bytes) {
  if (!bytes || typeof bytes !== 'number') return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType, filename) {
  const m = (mimeType || '').toLowerCase();
  const f = (filename || '').toLowerCase();
  if (m.includes('pdf') || f.endsWith('.pdf')) return 'fa-file-pdf';
  if (m.includes('word') || m.includes('msword') || /\.(docx?|odt)$/i.test(f)) return 'fa-file-word';
  if (m.includes('sheet') || m.includes('excel') || /\.(xlsx?|ods|csv)$/i.test(f)) return 'fa-file-excel';
  if (m.includes('presentation') || m.includes('powerpoint') || /\.(pptx?|odp)$/i.test(f)) return 'fa-file-powerpoint';
  if (m.includes('zip') || m.includes('rar') || /\.(zip|rar|7z|tar|gz)$/i.test(f)) return 'fa-file-zipper';
  if (m.startsWith('image/')) return 'fa-file-image';
  if (m.startsWith('video/')) return 'fa-file-video';
  if (m.startsWith('audio/')) return 'fa-file-audio';
  return 'fa-file';
}

function EmailAttachments({ message }) {
  const attachments = parseAttachments(message.attachments_json);
  if (!attachments.length) return null;

  // Inline-images (cid:) zijn al in de body verwerkt — toon ze niet apart
  const visible = attachments.filter((a) => !a.isInline);
  if (!visible.length) return null;

  const images = visible.filter((a) => (a.mimeType || '').startsWith('image/'));
  const files = visible.filter((a) => !(a.mimeType || '').startsWith('image/'));

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        <i className="fa-solid fa-paperclip mr-1" />
        {visible.length} bijlage{visible.length === 1 ? '' : 'n'}
      </div>
      {images.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {images.map((att) => {
            const url = `/api/messages/${encodeURIComponent(message.id)}/attachment/${encodeURIComponent(att.id)}`;
            return (
              <a
                key={att.id}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={att.filename}
                className="block"
              >
                <img
                  src={url}
                  alt={att.filename || 'bijlage'}
                  loading="lazy"
                  className="h-24 w-24 cursor-pointer rounded-lg border border-gray-200 object-cover transition-shadow hover:shadow-md"
                />
              </a>
            );
          })}
        </div>
      ) : null}
      {files.length > 0 ? (
        <div className="space-y-1">
          {files.map((att) => {
            const url = `/api/messages/${encodeURIComponent(message.id)}/attachment/${encodeURIComponent(att.id)}`;
            return (
              <a
                key={att.id}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                download={att.filename}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm transition-colors hover:bg-gray-100"
              >
                <i className={`fa-solid ${getFileIcon(att.mimeType, att.filename)} text-gray-400`} />
                <span className="min-w-0 flex-1 truncate text-gray-700">{att.filename || 'Bijlage'}</span>
                {att.size ? <span className="shrink-0 text-xs text-gray-400">{formatFileSize(att.size)}</span> : null}
                <i className="fa-solid fa-download text-gray-400" />
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function EmailThread({ message, threadMessages }) {
  // Bij stap 3+: threadMessages is een array van alle berichten in dezelfde thread
  const messages = threadMessages?.length ? threadMessages : [message];
  const newestId = messages[messages.length - 1]?.id;

  return (
    <div className="space-y-3 px-8 py-6">
      {messages.map((m) => (
        <EmailItem key={m.id} message={m} expanded={m.id === newestId} />
      ))}
      {messages.length === 1 && !message.body_html && !message.body_text ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500">
          Volledige email body wordt geladen na Gmail sync (stap 3).
        </div>
      ) : null}
    </div>
  );
}

function EmailItem({ message, expanded: initialExpanded }) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const bodyRef = useRef(null);
  const m = message;
  const isOutbound = m.direction === 'outbound';

  // Re-apply target attribute on rendered links (DOMPurify hook handles markup,
  // this defends if React re-renders innerHTML)
  useEffect(() => {
    if (!expanded || !bodyRef.current) return;
    bodyRef.current.querySelectorAll('a').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  }, [expanded, m.body_html]);

  const attachments = parseAttachments(m.attachments_json);
  const rawHtml = m.body_html ? sanitize(m.body_html) : null;
  const html = rawHtml ? replaceCidImages(rawHtml, m.id, attachments) : null;
  const textBody = m.body_text || m.snippet || '';

  return (
    <article className={cn(
      'overflow-hidden rounded-xl border bg-white shadow-sm',
      isOutbound ? 'border-blue-100' : 'border-gray-200',
    )}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 border-b border-gray-100 px-5 py-4 text-left transition-colors hover:bg-gray-50"
      >
        <Avatar
          name={isOutbound ? 'Ramon' : m.contact_name}
          initials={isOutbound ? 'RB' : m.contact_initials}
          color={isOutbound ? '#3b82f6' : m.contact_color}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                {isOutbound ? 'Jij' : (m.contact_name || 'Onbekend')}
                {isOutbound ? (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">verzonden</span>
                ) : null}
              </div>
              <div className="truncate text-xs text-gray-500">
                {isOutbound ? `Van ${m.channel_account || ''}` : (m.contact_email || '')}
                {!isOutbound && m.channel_account ? <span className="ml-1 text-gray-400">→ {m.channel_account}</span> : null}
              </div>
            </div>
            <div className="shrink-0 text-xs text-gray-500">{formatDateTime(parseDateSafe(m.received_at))}</div>
          </div>
          {!expanded ? (
            <div className="mt-2 line-clamp-1 text-sm text-gray-600">{m.snippet}</div>
          ) : null}
        </div>
      </button>

      <div className={cn('transition-all', expanded ? 'block' : 'hidden')}>
        <div className="px-5 py-5">
          {html ? (
            <div
              ref={bodyRef}
              className="email-body prose prose-sm max-w-none break-words text-gray-800"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-800">{textBody}</pre>
          )}
          <EmailAttachments message={m} />
        </div>
      </div>
    </article>
  );
}
