import { useThreadSummary } from '../../hooks/useMessages.js';
import Avatar from '../shared/Avatar.jsx';
import { formatDateTime, parseDateSafe } from '../../lib/utils.js';

export default function ThreadSummaryPanel({ messageId, onClose }) {
  const { data, isLoading } = useThreadSummary(messageId);

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-gray-200 bg-white">
      <header className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <i className="fa-solid fa-circle-info text-blue-600" />
        <h3 className="flex-1 text-sm font-semibold text-gray-900">Thread info</h3>
        {onClose ? (
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title="Sluit panel"
            aria-label="Sluit thread info"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading || !data ? (
          <div className="p-4 text-xs text-gray-400">Laden…</div>
        ) : (
          <>
            {data.subject ? (
              <Section label="Onderwerp">
                <div className="break-words text-sm font-medium text-gray-900">{data.subject}</div>
              </Section>
            ) : null}

            <Section label="Deelnemers">
              {data.participants?.length ? (
                <div className="space-y-1.5">
                  {data.participants.map((p, i) => (
                    <div key={p.id || `${p.name}-${i}`} className="flex items-center gap-2">
                      <Avatar name={p.name} initials={p.initials} color={p.color} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{p.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400">Geen deelnemers</div>
              )}
            </Section>

            <Section label="Activiteit">
              <div className="space-y-1 text-xs text-gray-600">
                <Stat icon="fa-comments" label={`${data.total_messages} bericht${data.total_messages === 1 ? '' : 'en'}`} />
                <Stat icon="fa-arrow-down" label={`${data.inbound_count} inbound`} />
                <Stat icon="fa-arrow-up" label={`${data.outbound_count} outbound`} />
                {data.has_attachments ? (
                  <Stat icon="fa-paperclip" label={`${data.attachment_count} bijlage${data.attachment_count === 1 ? '' : 'n'}`} />
                ) : null}
              </div>
            </Section>

            <Section label="Tijdlijn">
              <div className="space-y-1 text-xs text-gray-600">
                {data.first_message_at ? (
                  <div>
                    <span className="text-gray-400">Eerste:</span>{' '}
                    <span className="text-gray-800">{formatDateTime(parseDateSafe(data.first_message_at))}</span>
                  </div>
                ) : null}
                {data.last_message_at ? (
                  <div>
                    <span className="text-gray-400">Laatste:</span>{' '}
                    <span className="text-gray-800">{formatDateTime(parseDateSafe(data.last_message_at))}</span>
                    {data.last_sender ? <span className="ml-1 text-gray-500">· van {data.last_sender}</span> : null}
                  </div>
                ) : null}
              </div>
              {data.last_snippet ? (
                <div className="mt-2 rounded-md bg-gray-50 px-2.5 py-1.5 text-[11px] italic leading-snug text-gray-600">
                  &ldquo;{data.last_snippet}&rdquo;
                </div>
              ) : null}
            </Section>

            {data.ai_summary ? (
              <Section label="AI samenvatting">
                <div className="whitespace-pre-line rounded-lg border border-purple-100 bg-purple-50/60 p-3 text-[12px] leading-relaxed text-purple-900">
                  {data.ai_summary}
                </div>
              </Section>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

function Section({ label, children }) {
  return (
    <div className="border-b border-gray-100 px-4 py-3 last:border-b-0">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      {children}
    </div>
  );
}

function Stat({ icon, label }) {
  return (
    <div className="flex items-center gap-2">
      <i className={`fa-solid ${icon} w-3.5 text-gray-400`} />
      <span>{label}</span>
    </div>
  );
}
