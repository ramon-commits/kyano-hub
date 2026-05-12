import { useState } from 'react';
import { useMessages } from '../../hooks/useMessages.js';
import MessageRow from '../inbox/MessageRow.jsx';
import MessageFilters from '../inbox/MessageFilters.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import { DONE_CATEGORIES } from '../../lib/constants.js';
import { groupByDate, cn } from '../../lib/utils.js';

const GROUP_TITLES = {
  vandaag: 'Vandaag',
  gisteren: 'Gisteren',
  deze_week: 'Deze week',
  eerder: 'Eerder',
};

export default function LogboekView({ onOpenMessage, onReopen, selectedId }) {
  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  const params = { status: 'done', limit: 200 };
  if (channelFilter !== 'all') params.channel_type = channelFilter;
  if (search) params.search = search;

  const { data, isLoading } = useMessages(params);
  let messages = data?.messages || [];

  if (category !== 'all') {
    messages = messages.filter((m) => m.done_category === category);
  }

  const grouped = groupByDate(messages, (m) => m.done_at || m.received_at);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-8 py-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">📋 Logboek</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {messages.length} afgehandelde berichten
            </p>
          </div>
          <a
            href={`/api/export/logboek${(() => {
              const qs = new URLSearchParams();
              if (channelFilter !== 'all') qs.set('channel_type', channelFilter);
              return qs.size ? '?' + qs : '';
            })()}`}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            download
          >
            📥 Exporteer CSV
          </a>
        </div>

        <div className="space-y-3">
          <MessageFilters
            channelFilter={channelFilter}
            onChannelFilter={setChannelFilter}
            search={search}
            onSearch={setSearch}
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Categorie:</span>
            <CategoryChip active={category === 'all'} onClick={() => setCategory('all')}>Alle</CategoryChip>
            {DONE_CATEGORIES.map((c) => (
              <CategoryChip
                key={c.value}
                active={category === c.value}
                color={c.color}
                onClick={() => setCategory(c.value)}
              >
                {c.icon} {c.label}
              </CategoryChip>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-8 my-6 space-y-6">
          {isLoading ? (
            <div className="rounded-xl border border-gray-200 bg-white py-16"><LoadingSpinner label="Logboek laden…" /></div>
          ) : messages.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white">
              <EmptyState
                icon="📭"
                title={search || category !== 'all' ? 'Geen matches' : 'Logboek is leeg'}
                description={search || category !== 'all'
                  ? 'Probeer een andere zoekterm of categorie.'
                  : 'Hier komen je afgehandelde berichten te staan.'}
              />
            </div>
          ) : (
            ['vandaag', 'gisteren', 'deze_week', 'eerder'].map((key) => {
              const items = grouped[key];
              if (!items?.length) return null;
              return (
                <section key={key}>
                  <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {GROUP_TITLES[key]} <span className="text-gray-400">· {items.length}</span>
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    {items.map((m) => (
                      <MessageRow
                        key={m.id}
                        message={m}
                        selected={selectedId === m.id}
                        onClick={() => onOpenMessage(m)}
                        onReopen={onReopen}
                        showDoneInfo
                      />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryChip({ children, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-all',
        active
          ? 'border-transparent text-white shadow-sm'
          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
      )}
      style={active ? { background: color || '#3b82f6' } : undefined}
    >
      {children}
    </button>
  );
}
