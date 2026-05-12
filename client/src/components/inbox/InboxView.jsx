import { useState } from 'react';
import { useMessages, useSyncAll } from '../../hooks/useMessages.js';
import { useStats } from '../../hooks/useStats.js';
import { useToast } from '../../hooks/useToast.jsx';
import MessageRow from './MessageRow.jsx';
import MessageFilters from './MessageFilters.jsx';
import DailySummaryCard from './DailySummaryCard.jsx';
import TodayWidget from './TodayWidget.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import { cn } from '../../lib/utils.js';

function MetricCard({ icon, label, value, color }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center gap-3">
        <div
          className="grid h-10 w-10 place-items-center rounded-lg text-lg"
          style={{ background: color.bg, color: color.text }}
        >
          {icon}
        </div>
        <div>
          <div className="text-2xl font-semibold leading-none text-gray-900">{value ?? '—'}</div>
          <div className="mt-1 text-xs font-medium text-gray-500">{label}</div>
        </div>
      </div>
    </div>
  );
}

export default function InboxView({ onOpenMessage, onSnooze, onDone, onSchedule, onOpenContact, onBlock, selectedId }) {
  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');

  const params = { status: 'open' };
  if (channelFilter !== 'all') params.channel_type = channelFilter;
  if (search) params.search = search;

  const { data, isLoading } = useMessages(params);
  const { data: stats } = useStats();
  const syncAll = useSyncAll();
  const toast = useToast();

  const messages = data?.messages || [];

  const handleSync = async () => {
    try {
      const r = await syncAll.mutateAsync();
      const total = r.total_new ?? 0;
      if (total === 0) {
        toast.info('Geen nieuwe berichten gevonden');
      } else {
        toast.success(`${total} nieuwe bericht${total === 1 ? '' : 'en'}`, '📧 Sync klaar');
      }
      const errors = (r.results || []).filter((x) => !x.ok);
      if (errors.length) {
        toast.warning(`${errors.length} kanaal/kanalen gaf foutmelding — check Instellingen`);
      }
    } catch (e) {
      toast.error(e.message || 'Sync mislukt');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-8 py-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Inbox</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {stats ? `${stats.open_count} berichten wachten op actie` : 'Laden…'}
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncAll.isPending}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className={syncAll.isPending ? 'inline-block animate-spin' : ''}>🔄</span>
            {syncAll.isPending ? 'Synchroniseren…' : 'Nieuwe check'}
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard icon="📬" label="Open" value={stats?.open_count} color={{ bg: '#eff6ff', text: '#3b82f6' }} />
          <MetricCard icon="⏰" label="Snoozed" value={stats?.snoozed_count} color={{ bg: '#fff7ed', text: '#ea580c' }} />
          <MetricCard icon="✅" label="Vandaag afgehandeld" value={stats?.done_today} color={{ bg: '#f0fdf4', text: '#16a34a' }} />
          <MetricCard icon="🔥" label="Urgent" value={stats?.urgent_count} color={{ bg: '#fef2f2', text: '#dc2626' }} />
        </div>

        <MessageFilters
          channelFilter={channelFilter}
          onChannelFilter={setChannelFilter}
          search={search}
          onSearch={setSearch}
        />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-8 mt-6">
          <DailySummaryCard onOpenContact={onOpenContact} />
          <TodayWidget />
        </div>
        <div className={cn('mx-8 mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm')}>
          {isLoading ? (
            <div className="py-16"><LoadingSpinner label="Berichten laden…" /></div>
          ) : messages.length === 0 ? (
            <EmptyState
              icon="🌅"
              title={search ? 'Geen resultaten' : 'Inbox is leeg'}
              description={search ? 'Geen berichten die matchen met je zoekterm.' : 'Alle berichten zijn afgehandeld of gesnoozet. Tijd voor koffie.'}
            />
          ) : (
            messages.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                selected={selectedId === m.id}
                onClick={() => onOpenMessage(m)}
                onSnooze={onSnooze}
                onDone={onDone}
                onSchedule={onSchedule}
                onBlock={onBlock}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
