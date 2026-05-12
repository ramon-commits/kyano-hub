import { useState } from 'react';
import { useMessages } from '../../hooks/useMessages.js';
import MessageRow from '../inbox/MessageRow.jsx';
import MessageFilters from '../inbox/MessageFilters.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import { parseDateSafe } from '../../lib/utils.js';

export default function SnoozedView({ onOpenMessage, onReopen, onDone, selectedId }) {
  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');

  const params = { status: 'snoozed,waiting' };
  if (channelFilter !== 'all') params.channel_type = channelFilter;
  if (search) params.search = search;

  const { data, isLoading } = useMessages(params);
  const messages = (data?.messages || []).slice().sort((a, b) => {
    if (a.status === 'snoozed' && b.status === 'snoozed') {
      return new Date(a.snoozed_until || 0) - new Date(b.snoozed_until || 0);
    }
    if (a.status === 'snoozed') return -1;
    if (b.status === 'snoozed') return 1;
    return 0;
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-8 py-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">⏰ Snoozed</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {messages.length} bericht{messages.length === 1 ? '' : 'en'} wachten op terugkomst
            </p>
          </div>
        </div>

        <MessageFilters
          channelFilter={channelFilter}
          onChannelFilter={setChannelFilter}
          search={search}
          onSearch={setSearch}
        />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-8 my-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="py-16"><LoadingSpinner label="Snoozed berichten laden…" /></div>
          ) : messages.length === 0 ? (
            <EmptyState
              icon="😌"
              title="Geen snoozed berichten"
              description="Snooze een bericht uit je inbox om het later terug te laten komen."
            />
          ) : (
            messages.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                selected={selectedId === m.id}
                onClick={() => onOpenMessage(m)}
                onReopen={onReopen}
                onDone={onDone}
                showWakeUp
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
