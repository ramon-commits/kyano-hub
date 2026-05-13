import { useEffect, useState } from 'react';
import { useContacts } from '../../hooks/useContacts.js';
import Avatar from '../shared/Avatar.jsx';
import Badge from '../shared/Badge.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import PageHeader from '../shared/PageHeader.jsx';
import { debounce, getDaysSinceContact, cn } from '../../lib/utils.js';

const SORT_OPTIONS = [
  { id: 'name', label: 'Naam (A-Z)' },
  { id: 'last_contact', label: 'Laatst gesproken' },
  { id: 'messages', label: 'Meeste berichten' },
];

const FILTER_OPTIONS = [
  { id: '', label: 'Alle contacten' },
  { id: 'has_open', label: 'Heeft open berichten' },
  { id: 'no_contact_14d', label: 'Niet gesproken >14d' },
];

export default function ContactenView({ onOpenContact }) {
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [sort, setSort] = useState('name');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const dbn = debounce((v) => setSearchDebounced(v), 300);
    dbn(search);
  }, [search]);

  const params = {};
  if (searchDebounced) params.search = searchDebounced;
  if (sort) params.sort = sort;
  if (filter) params.filter = filter;

  const { data, isLoading } = useContacts(params);
  const contacts = data?.contacts || [];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Contacten"
        subtitle={`${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacten'}`}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><i className="fa-solid fa-magnifying-glass" /></span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek op naam, bedrijf, email, telefoon…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
          >
            {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
          >
            {FILTER_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto bg-gray-50 scrollbar-thin">
        <div className="mx-8 my-6">
          {isLoading ? (
            <LoadingSpinner label="Contacten laden…" />
          ) : contacts.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white">
              <EmptyState
                icon="handshake"
                title={search ? 'Geen resultaten' : 'Nog geen contacten'}
                description={search ? 'Probeer een andere zoekterm.' : 'Contacten verschijnen hier zodra je berichten gaat ontvangen.'}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {contacts.map((c) => (
                <ContactCard key={c.id} contact={c} onClick={() => onOpenContact?.(c)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactCard({ contact, onClick }) {
  const daysSince = getDaysSinceContact(contact.last_message_at);
  const isStale = daysSince != null && daysSince > 14;

  return (
    <button
      onClick={onClick}
      className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
    >
      <Avatar
        name={contact.name}
        initials={contact.avatar_initials}
        color={contact.avatar_color}
        size="lg"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-gray-900">{contact.name}</div>
        {contact.company ? (
          <div className="truncate text-xs text-gray-500">{contact.company}</div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {contact.open_count > 0 ? (
            <Badge color="#3b82f6" bg="#eff6ff"><i className="fa-solid fa-inbox mr-1" />{contact.open_count} open</Badge>
          ) : null}
          {contact.message_count > 0 ? (
            <Badge color="#374151" bg="#f3f4f6"><i className="fa-solid fa-comment mr-1" />{contact.message_count}</Badge>
          ) : null}
        </div>

        <div className={cn('mt-2 text-[11px]', isStale ? 'font-medium text-red-600' : 'text-gray-500')}>
          {daysSince != null
            ? (daysSince === 0 ? 'Laatste contact: vandaag' : `Laatste contact: ${daysSince}d geleden`)
            : 'Nog geen berichten'}
        </div>
      </div>
    </button>
  );
}
