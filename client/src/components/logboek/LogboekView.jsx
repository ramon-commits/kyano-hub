import { useState } from 'react';
import { useMessages } from '../../hooks/useMessages.js';
import MessageRow from '../inbox/MessageRow.jsx';
import MessageFilters from '../inbox/MessageFilters.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import PageHeader from '../shared/PageHeader.jsx';
import { DONE_CATEGORIES } from '../../lib/constants.js';
import { groupByDate, cn } from '../../lib/utils.js';

const GROUP_TITLES = {
  vandaag: 'VANDAAG',
  gisteren: 'GISTEREN',
  deze_week: 'DEZE WEEK',
  eerder: 'EERDER',
};

const CATEGORY_STYLES = {
  replied:       { bg: '#eff6ff', text: '#3b82f6', activeBg: '#3b82f6' },
  called:        { bg: '#dcfce7', text: '#16a34a', activeBg: '#16a34a' },
  offer_sent:    { bg: '#f5f3ff', text: '#7c3aed', activeBg: '#7c3aed' },
  forwarded:     { bg: '#fff7ed', text: '#ea580c', activeBg: '#ea580c' },
  not_relevant:  { bg: '#f3f4f6', text: '#6b7280', activeBg: '#6b7280' },
  other:         { bg: '#f3f4f6', text: '#6b7280', activeBg: '#6b7280' },
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

  const exportUrl = `/api/export/logboek${(() => {
    const qs = new URLSearchParams();
    if (channelFilter !== 'all') qs.set('channel_type', channelFilter);
    return qs.size ? '?' + qs : '';
  })()}`;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Logboek"
        subtitle={`${messages.length} afgehandelde bericht${messages.length === 1 ? '' : 'en'}`}
        actions={
          <a
            href={exportUrl}
            download
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
          >
            <i className="fa-solid fa-inbox" />Exporteer CSV
          </a>
        }
      >
        <div className="space-y-3">
          <MessageFilters
            channelFilter={channelFilter}
            onChannelFilter={setChannelFilter}
            search={search}
            onSearch={setSearch}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">Categorie</span>
            <CategoryChip active={category === 'all'} onClick={() => setCategory('all')}>Alle</CategoryChip>
            {DONE_CATEGORIES.map((c) => {
              const style = CATEGORY_STYLES[c.value] || CATEGORY_STYLES.other;
              return (
                <CategoryChip
                  key={c.value}
                  active={category === c.value}
                  bg={style.bg}
                  text={style.text}
                  activeBg={style.activeBg}
                  onClick={() => setCategory(c.value)}
                >
                  <i className={`fa-solid fa-${c.icon} mr-1`} />{c.label}
                </CategoryChip>
              );
            })}
          </div>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto bg-gray-50 scrollbar-thin">
        <div className="mx-8 my-6 space-y-6">
          {isLoading ? (
            <div className="rounded-xl border border-gray-200 bg-white py-16"><LoadingSpinner label="Logboek laden…" /></div>
          ) : messages.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white">
              <EmptyState
                icon="clipboard-list"
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
                  <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                    {GROUP_TITLES[key]} <span className="ml-1 text-gray-300">· {items.length}</span>
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

function CategoryChip({ children, active, bg, text, activeBg, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-[11px] font-medium transition-all',
        active ? 'border-transparent text-white shadow-sm' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
      )}
      style={
        active
          ? { background: activeBg || '#3b82f6' }
          : (bg ? { background: bg, color: text } : undefined)
      }
    >
      {children}
    </button>
  );
}
