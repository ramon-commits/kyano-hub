import { useEffect, useMemo, useState } from 'react';
import { useMessages, usePinnedMessages, useSyncAll } from '../../hooks/useMessages.js';
import { useStats } from '../../hooks/useStats.js';
import { useToast } from '../../hooks/useToast.jsx';
import { useSelection, useSelectionShortcuts } from '../../hooks/useSelection.js';
import MessageRow from './MessageRow.jsx';
import MessageFilters from './MessageFilters.jsx';
import DailySummaryCard from './DailySummaryCard.jsx';
import AgendaWidget from './AgendaWidget.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import BulkActionBar from '../shared/BulkActionBar.jsx';

function MetricCard({ icon, label, value, color }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
            {label}
          </div>
          <div className="mt-2 text-[28px] font-bold leading-none" style={{ color: color.text }}>
            {value ?? '—'}
          </div>
        </div>
        <div
          className="grid h-10 w-10 place-items-center rounded-lg text-lg"
          style={{ background: color.bg, color: color.text }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function InboxView({ onOpenMessage, onSnooze, onDone, onFastDone, onSchedule, onOpenContact, onBlock, onArchive, onPin, onUnpin, onNavigate, onBulkSnooze, onBulkDone, onBulkArchive, onBulkBlock, selectedId, onMessagesChange }) {
  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);

  const params = { status: 'open', limit };
  if (channelFilter !== 'all') params.channel_type = channelFilter;
  if (search) params.search = search;

  const { data, isLoading } = useMessages(params);
  const { data: pinnedData } = usePinnedMessages();
  const { data: stats } = useStats();
  const syncAll = useSyncAll();
  const toast = useToast();

  // Reset paginatie wanneer filter of zoekterm verandert
  useEffect(() => { setLimit(50); }, [channelFilter, search]);


  const allMessages = data?.messages || [];
  const totalMessages = data?.total || 0;
  const hasMore = allMessages.length < totalMessages;
  const pinned = pinnedData?.messages || [];

  // Filter pinned thread_ids out of the regular list to avoid duplicate rows
  const pinnedThreadIds = useMemo(() => new Set(pinned.map((m) => m.thread_id).filter(Boolean)), [pinned]);
  const messages = useMemo(
    () => allMessages.filter((m) => !m.thread_id || !pinnedThreadIds.has(m.thread_id)),
    [allMessages, pinnedThreadIds],
  );

  // Geef App de volgorde van de inbox door zodat keyboard-acties auto-advancen naar het volgende bericht
  useEffect(() => {
    if (!onMessagesChange) return;
    onMessagesChange([...pinned.map((m) => m.id), ...messages.map((m) => m.id)]);
  }, [pinned, messages, onMessagesChange]);

  const selection = useSelection(messages);
  useSelectionShortcuts({
    count: selection.count,
    onSelectAll: selection.selectAll,
    onClear: selection.clear,
  });

  const selectedMessages = messages.filter((m) => selection.selectedIds.has(m.id));

  const handleSync = async () => {
    try {
      const r = await syncAll.mutateAsync();
      const total = r.total_new ?? 0;
      if (total === 0) toast.info('Geen nieuwe berichten gevonden');
      else toast.success(`${total} nieuwe bericht${total === 1 ? '' : 'en'}`, 'Sync klaar');
      const errors = (r.results || []).filter((x) => !x.ok);
      if (errors.length) toast.warning(`${errors.length} kanaal/kanalen gaf foutmelding — check Instellingen`);
    } catch (e) {
      toast.error(e.message || 'Sync mislukt');
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-8 pb-5 pt-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold leading-tight text-gray-900">Inbox</h1>
            <p className="mt-1 text-sm text-gray-500">
              {stats ? `${stats.open_count} bericht${stats?.open_count === 1 ? '' : 'en'} wachten op actie` : 'Laden…'}
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncAll.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
          >
            <i className={`fa-solid fa-arrows-rotate ${syncAll.isPending ? 'animate-spin' : ''}`} />
            {syncAll.isPending ? 'Synchroniseren…' : 'Nieuwe check'}
          </button>
        </div>

        {/* Metric cards */}
        <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard icon={<i className="fa-solid fa-inbox" />} label="Open" value={stats?.open_count} color={{ bg: '#eff6ff', text: '#3b82f6' }} />
          <MetricCard icon={<i className="fa-solid fa-clock" />} label="Snoozed" value={stats?.snoozed_count} color={{ bg: '#fff7ed', text: '#ea580c' }} />
          <MetricCard icon={<i className="fa-solid fa-circle-check" />} label="Vandaag afgehandeld" value={stats?.done_today} color={{ bg: '#dcfce7', text: '#16a34a' }} />
          <MetricCard icon={<i className="fa-solid fa-fire" />} label="Urgent" value={stats?.urgent_count} color={{ bg: '#fef2f2', text: '#dc2626' }} />
        </div>

        <MessageFilters
          channelFilter={channelFilter}
          onChannelFilter={setChannelFilter}
          search={search}
          onSearch={setSearch}
        />
      </div>

      {/* Lijst + agenda */}
      <div className="flex-1 overflow-y-auto bg-gray-50 scrollbar-thin">
        <div className="mx-8 mt-6">
          <DailySummaryCard onOpenContact={onOpenContact} />
        </div>

        {/* 2-kolom op lg+, gestapeld op kleiner scherm (agenda boven berichten) */}
        <div className="mx-8 mb-8 flex flex-col gap-6 lg:flex-row">
          {/* Agenda kolom (rechts op lg, boven op mobile) */}
          <aside className="order-1 lg:order-2 lg:w-[340px] lg:shrink-0">
            <div className="lg:sticky lg:top-2">
              <AgendaWidget onNavigate={onNavigate} onOpenContact={onOpenContact} />
            </div>
          </aside>

          {/* Berichten kolom */}
          <div className="order-2 min-w-0 flex-1 space-y-4 lg:order-1">
            {pinned.length > 0 ? (
              <div>
                <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-700">
                  <i className="fa-solid fa-thumbtack" /> Vastgezet · {pinned.length}
                </div>
                <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm ring-1 ring-amber-100">
                  {pinned.map((m) => (
                    <MessageRow
                      key={`pin-${m.id}`}
                      message={m}
                      selected={selectedId === m.id}
                      onClick={() => onOpenMessage(m)}
                      onSnooze={onSnooze}
                      onDone={onDone}
                      onFastDone={onFastDone}
                      onSchedule={onSchedule}
                      onArchive={onArchive}
                      onUnpin={onUnpin}
                      isPinned
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              {isLoading ? (
                <div className="py-16"><LoadingSpinner label="Berichten laden…" /></div>
              ) : messages.length === 0 ? (
                <EmptyState
                  icon={search ? 'magnifying-glass' : 'inbox'}
                  title={search ? 'Geen resultaten' : 'Inbox zero! Alles is afgehandeld.'}
                  description={search ? 'Geen berichten die matchen met je zoekterm.' : 'Alle berichten zijn afgehandeld of gesnoozet. Tijd voor koffie.'}
                />
              ) : (
                <>
                  <SelectAllHeader
                    allSelected={selection.allSelected}
                    someSelected={selection.someSelected}
                    count={selection.count}
                    total={messages.length}
                    onToggleAll={selection.toggleAll}
                  />
                  {messages.map((m) => (
                    <MessageRow
                      key={m.id}
                      message={m}
                      selected={selectedId === m.id}
                      onClick={() => onOpenMessage(m)}
                      onSnooze={onSnooze}
                      onDone={onDone}
                      onFastDone={onFastDone}
                      onSchedule={onSchedule}
                      onArchive={onArchive}
                      onBlock={onBlock}
                      onPin={onPin}
                      selectable
                      isSelected={selection.selectedIds.has(m.id)}
                      onToggleSelect={selection.toggle}
                    />
                  ))}
                  {hasMore ? (
                    <div className="border-t border-gray-100 bg-gray-50/40 px-5 py-3 text-center">
                      <button
                        onClick={() => setLimit((l) => l + 50)}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:shadow"
                      >
                        <i className="fa-solid fa-chevron-down" />
                        Laad meer ({allMessages.length} van {totalMessages})
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>

        <BulkActionBar
          count={selection.count}
          onSnooze={() => onBulkSnooze?.([...selection.selectedIds])}
          onDone={() => onBulkDone?.([...selection.selectedIds])}
          onArchive={async () => {
            const ids = [...selection.selectedIds];
            const ok = await onBulkArchive?.(ids);
            if (ok !== false) selection.clear();
          }}
          onBlock={async () => {
            const ok = await onBulkBlock?.([...selection.selectedIds], selectedMessages);
            if (ok !== false) selection.clear();
          }}
          onClear={selection.clear}
        />
      </div>
    </div>
  );
}

function SelectAllHeader({ allSelected, someSelected, count, total, onToggleAll }) {
  return (
    <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-2.5">
      <input
        type="checkbox"
        checked={allSelected}
        ref={(el) => { if (el) el.indeterminate = someSelected; }}
        onChange={onToggleAll}
        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/30"
        aria-label="Selecteer alle berichten"
      />
      <span className="text-xs font-medium text-gray-600">
        {count > 0 ? `${count} van ${total} geselecteerd` : `Selecteer alle (${total})`}
      </span>
      <span className="ml-auto text-[11px] text-gray-400">
        Shift+klik voor reeks · ⌘A = alles · Esc = wissen
      </span>
    </div>
  );
}
