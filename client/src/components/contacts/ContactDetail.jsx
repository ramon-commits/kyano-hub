import { useState } from 'react';
import Avatar from '../shared/Avatar.jsx';
import Badge from '../shared/Badge.jsx';
import ChannelBadge from '../shared/ChannelBadge.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import ContactEditModal from './ContactEditModal.jsx';
import { useContact } from '../../hooks/useContacts.js';
import { useContactMessages } from '../../hooks/useMessages.js';
import { formatDateShort, getDaysSinceContact, getDaysUntilBirthday, timeAgo } from '../../lib/utils.js';
import { STATUS_COLORS } from '../../lib/constants.js';

export default function ContactDetail({ contactId, onClose, onOpenMessage, onSchedule }) {
  const { data: contact, isLoading } = useContact(contactId);
  const { data: msgs } = useContactMessages(contactId);
  const [editOpen, setEditOpen] = useState(false);

  if (!contactId) return null;

  return (
    <aside
      className="flex h-full w-[420px] flex-col border-l border-gray-200 bg-white shadow-xl"
      style={{ animation: 'slide-in-right 0.2s ease-out' }}
    >
      <header className="flex items-start gap-3 border-b border-gray-100 p-5">
        {isLoading || !contact ? (
          <div className="flex w-full items-center"><LoadingSpinner /></div>
        ) : (
          <>
            <Avatar name={contact.name} initials={contact.avatar_initials} color={contact.avatar_color} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-gray-900">{contact.name}</h2>
              {contact.company ? <p className="truncate text-sm text-gray-500">{contact.company}</p> : null}
              <button
                onClick={() => setEditOpen(true)}
                className="mt-2 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                ✏️ Bewerken
              </button>
            </div>
          </>
        )}
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100" title="Sluiten">
          ×
        </button>
      </header>

      {!contact ? null : (
        <>
          <div className="grid grid-cols-3 gap-2 border-b border-gray-100 px-5 py-3">
            <ActionBtn icon="📅" label="Afspraak" onClick={() => onSchedule?.(contact)} />
            <ActionBtn icon="✉️" label="Mail" disabled />
            <ActionBtn icon="💬" label="WhatsApp" disabled />
          </div>

          <div className="grid grid-cols-2 gap-2 px-5 py-4">
            <InfoCard
              icon="🕐"
              label="Laatste contact"
              value={contact.last_message_at ? `${getDaysSinceContact(contact.last_message_at)}d` : '—'}
              warn={contact.last_message_at && getDaysSinceContact(contact.last_message_at) > 14}
            />
            <InfoCard
              icon="🎂"
              label="Verjaardag"
              value={contact.birthday
                ? (() => {
                    const d = getDaysUntilBirthday(contact.birthday);
                    if (d === 0) return 'Vandaag!';
                    if (d === 1) return 'Morgen';
                    return `Over ${d}d`;
                  })()
                : '—'}
              highlight={contact.birthday && getDaysUntilBirthday(contact.birthday) <= 7}
            />
          </div>

          <div className="space-y-2 border-y border-gray-100 px-5 py-4 text-sm">
            {contact.email ? <InfoRow icon="📧" value={contact.email} /> : null}
            {contact.phone ? <InfoRow icon="📱" value={contact.phone} /> : null}
            {contact.birthday ? <InfoRow icon="🎂" value={formatDateShort(`${contact.birthday}T00:00:00`)} /> : null}
            {contact.tags ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-gray-400">🏷️</span>
                {contact.tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                  <Badge key={t} bg="#eff6ff" color="#3b82f6">{t}</Badge>
                ))}
              </div>
            ) : null}
            {contact.notes ? (
              <div className="mt-2 rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
                📝 {contact.notes}
              </div>
            ) : null}
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Conversatie historie
              </h3>
              <Badge bg="#f3f4f6" color="#374151">
                {contact.message_count ?? msgs?.messages?.length ?? 0} berichten
              </Badge>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin">
              {!msgs?.messages?.length ? (
                <div className="px-3 py-6 text-center text-xs text-gray-500">
                  Nog geen berichten in de database
                </div>
              ) : (
                msgs.messages.map((m) => {
                  const status = STATUS_COLORS[m.status] || STATUS_COLORS.open;
                  return (
                    <button
                      key={m.id}
                      onClick={() => onOpenMessage?.(m)}
                      className="mb-1 block w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2">
                        <ChannelBadge type={m.channel_type} label={m.channel_label} size="xs" showLabel={false} />
                        <Badge color={status.text} bg={status.bg} size="xs">{status.label}</Badge>
                        <span className="ml-auto shrink-0 text-[11px] text-gray-400">{timeAgo(m.received_at)}</span>
                      </div>
                      {m.subject ? (
                        <div className="mt-1 truncate text-sm font-medium text-gray-800">{m.subject}</div>
                      ) : null}
                      <div className="mt-0.5 truncate text-xs text-gray-500">{m.snippet}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <ContactEditModal open={editOpen} onClose={() => setEditOpen(false)} contact={contact} />
        </>
      )}
    </aside>
  );
}

function ActionBtn({ icon, label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-gray-700"
    >
      <span className="text-lg">{icon}</span>
      {label}
    </button>
  );
}

function InfoCard({ icon, label, value, warn, highlight }) {
  return (
    <div
      className={`rounded-lg border px-3 py-3 ${
        warn
          ? 'border-red-200 bg-red-50'
          : highlight
            ? 'border-pink-200 bg-pink-50'
            : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span>{icon}</span>{label}
      </div>
      <div
        className={`mt-1 text-sm font-semibold ${
          warn ? 'text-red-700' : highlight ? 'text-pink-700' : 'text-gray-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function InfoRow({ icon, value }) {
  return (
    <div className="flex items-center gap-2 text-gray-700">
      <span className="text-gray-400">{icon}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}
