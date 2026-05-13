import { useState } from 'react';
import { useMessages } from '../../hooks/useMessages.js';
import MessageRow from '../inbox/MessageRow.jsx';
import MessageFilters from '../inbox/MessageFilters.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import PageHeader from '../shared/PageHeader.jsx';
import { parseDateSafe } from '../../lib/utils.js';

const GROUP_TITLES = {
  vandaag: 'VANDAAG',
  morgen: 'MORGEN',
  deze_week: 'DEZE WEEK',
  later: 'LATER',
  waiting: 'WACHT OP REACTIE',
};

function bucketFor(message) {
  if (message.status === 'waiting') return 'waiting';
  if (!message.snoozed_until) return 'later';
  const wake = parseDateSafe(message.snoozed_until);
  if (!wake) return 'later';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const weekEnd = new Date(today.getTime() + 7 * 86400000);
  if (wake < tomorrow) return 'vandaag';
  if (wake < new Date(tomorrow.getTime() + 86400000)) return 'morgen';
  if (wake < weekEnd) return 'deze_week';
  return 'later';
}

export default function SnoozedView({ onOpenMessage, onReopen, onDone, onSnooze, selectedId }) {
  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');

  const params = { status: 'snoozed,waiting' };
  if (channelFilter !== 'all') params.channel_type = channelFilter;
  if (search) params.search = search;

  const { data, isLoading } = useMessages(params);
  const messages = (data?.messages || []);

  const grouped = { vandaag: [], morgen: [], deze_week: [], later: [], waiting: [] };
  for (const m of messages) grouped[bucketFor(m)].push(m);
  for (const k of Object.keys(grouped)) {
    grouped[k].sort((a, b) => new Date(a.snoozed_until || 0) - new Date(b.snoozed_until || 0));
  }

  const total = messages.length;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="⏰ Snoozed"
        subtitle={`${total} bericht${total === 1 ? '' : 'en'} wachten op terugkomst`}
      >
        <MessageFilters
          channelFilter={channelFilter}
          onChannelFilter={setChannelFilter}
          search={search}
          onSearch={setSearch}
        />
      </PageHeader>

      <div className="flex-1 overflow-y-auto bg-gray-50 scrollbar-thin">
        <div className="mx-8 mt-6 mb-8 space-y-6">
          {isLoading ? (
            <div className="rounded-xl border border-gray-200 bg-white py-16"><LoadingSpinner label="Snoozed berichten laden…" /></div>
          ) : total === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white">
              <EmptyState
                icon="😌"
                title="Geen snoozed berichten"
                description="Snooze een bericht uit je inbox om het later terug te laten komen."
              />
            </div>
          ) : (
            ['vandaag', 'morgen', 'deze_week', 'later', 'waiting'].map((key) => {
              const items = grouped[key];
              if (!items?.length) return null;
              return (
                <section key={key}>
                  <h3 className={`mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${key === 'waiting' ? 'text-amber-700' : 'text-gray-400'}`}>
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
                        onDone={onDone}
                        onSnooze={onSnooze}
                        showWakeUp
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
