import { useState } from 'react';
import DOMPurify from 'dompurify';
import Avatar from '../shared/Avatar.jsx';
import { formatDateTime, parseDateSafe } from '../../lib/utils.js';
import { cn } from '../../lib/utils.js';

export default function EmailThread({ message }) {
  // Voor stap 2: één bericht (echte thread komt na Gmail sync in stap 3)
  const messages = [message];

  return (
    <div className="space-y-3 px-8 py-6">
      {messages.map((m, i) => (
        <EmailItem key={m.id} message={m} expanded={i === messages.length - 1} />
      ))}
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500">
        Volledige email thread wordt geladen na Gmail koppeling (stap 3).
      </div>
    </div>
  );
}

function EmailItem({ message, expanded: initialExpanded }) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const m = message;

  const html = m.body_html ? DOMPurify.sanitize(m.body_html, { USE_PROFILES: { html: true } }) : null;
  const textBody = m.body_text || m.snippet || '';

  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 border-b border-gray-100 px-5 py-4 text-left transition-colors hover:bg-gray-50"
      >
        <Avatar name={m.contact_name} initials={m.contact_initials} color={m.contact_color} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">{m.contact_name || 'Onbekend'}</div>
              <div className="text-xs text-gray-500">
                {m.contact_email || ''}
                {m.channel_account ? <span className="ml-1 text-gray-400">→ {m.channel_account}</span> : null}
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
            <div className="prose prose-sm max-w-none text-gray-800" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-800">{textBody}</pre>
          )}
        </div>
      </div>
    </article>
  );
}
