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

  const html = m.body_html ? sanitize(m.body_html) : null;
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
        </div>
      </div>
    </article>
  );
}
