import { useEffect, useMemo, useState } from 'react';
import { useMessages, usePinnedMessages, useSyncAll } from '../../hooks/useMessages.js';
import { useStats } from '../../hooks/useStats.js';
import { useToast } from '../../hooks/useToast.jsx';
import { useSelection, useSelectionShortcuts } from '../../hooks/useSelection.js';
import MessageRow from './MessageRow.jsx';
import MessageFilters from './MessageFilters.jsx';
import AgendaWidget from './AgendaWidget.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import BulkActionBar from '../shared/BulkActionBar.jsx';

function MetricRow({ label, value, icon, color, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white ${active ? 'bg-white shadow-sm' : ''}`}
    >
      <span className="flex items-center gap-2 text-gray-600">
        <i className={`fa-solid ${icon} ${color} w-4 text-xs`} />
        {label}
      </span>
      <span className={`font-bold ${color}`}>{value || 0}</span>
    </button>
  );
}

function MetricPillMini({ label, value, color, active, onClick, hide }) {
  if (hide) return null;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-all hover:shadow-sm ${color} ${active ? 'ring-2 ring-blue-500/20 shadow-sm' : ''}`}
    >
      <span className="text-sm font-bold">{value || 0}</span>
      <span className="opacity-75">{label}</span>
    </button>
  );
}

export default function InboxView({ onOpenMessage, onSnooze, onDone, onFastDone, onSchedule, onOpenContact, onBlock, onMarkSpam, onArchive, onPin, onUnpin, onForward, onNavigate, onBulkSnooze, onBulkDone, onBulkArchive, onBulkBlock, onBulkSpam, onCompose, onAsanaAction, selectedId }) {
  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const [statusFilter, setStatusFilter] = useState(null);

  const params = { status: 'open', limit };
  if (channelFilter !== 'all') params.channel_type = channelFilter;
  if (search) params.search = search;
  if (statusFilter === 'urgent') params.priority = 'high';

  const { data, isLoading, isError, error, refetch } = useMessages(params);
  const { data: pinnedData } = usePinnedMessages();
  const { data: stats } = useStats();
  const syncAll = useSyncAll();
  const toast = useToast();

  // Reset paginatie wanneer filter of zoekterm verandert
  useEffect(() => { setLimit(50); }, [channelFilter, search, statusFilter]);

  const handleStatusFilter = (filter) => {
    setStatusFilter((current) => (current === filter ? null : filter));
  };

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
    <div className="flex h-full">
      {/* LINKER KOLOM: header + filters + berichten */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header — compact, 1 regel */}
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 pb-3 pt-5">
          <div>
            <h1 className="text-xl font-bold leading-tight text-gray-900">Inbox</h1>
            <p className="text-xs text-gray-500">
              {stats ? `${stats.open_count} bericht${stats?.open_count === 1 ? '' : 'en'} wachten op actie` : 'Laden…'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onCompose ? (
              <button
                onClick={onCompose}
                title="Nieuw bericht (n)"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <i className="fa-solid fa-pen-to-square" />Nieuw bericht
              </button>
            ) : null}
            <button
              onClick={handleSync}
              disabled={syncAll.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <i className={`fa-solid fa-arrows-rotate ${syncAll.isPending ? 'animate-spin' : ''}`} />
              {syncAll.isPending ? 'Synchroniseren…' : 'Nieuwe check'}
            </button>
          </div>
        </div>

        {/* Filters + zoek — compact rij */}
        <div className="border-b border-gray-200 bg-white px-6 py-3">
          <MessageFilters
            channelFilter={channelFilter}
            onChannelFilter={setChannelFilter}
            search={search}
            onSearch={setSearch}
          />
        </div>

        {/* Mobile-only metric pills fallback (<lg) */}
        <div className="border-b border-gray-200 bg-white px-6 py-2 lg:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <MetricPillMini
              label="Open"
              value={stats?.open_count}
              color="text-blue-700 bg-blue-50 border-blue-200"
              active={statusFilter === null}
              onClick={() => setStatusFilter(null)}
            />
            <MetricPillMini
              label="Snoozed"
              value={stats?.snoozed_count}
              color="text-orange-700 bg-orange-50 border-orange-200"
              onClick={() => onNavigate?.('snoozed')}
            />
            <MetricPillMini
              label="Vandaag afgehandeld"
              value={stats?.done_today}
              color="text-green-700 bg-green-50 border-green-200"
              onClick={() => onNavigate?.('logboek')}
            />
            <MetricPillMini
              label="Urgent"
              value={stats?.urgent_count}
              color="text-red-700 bg-red-50 border-red-200"
              active={statusFilter === 'urgent'}
              onClick={() => handleStatusFilter('urgent')}
              hide={!stats?.urgent_count}
            />
          </div>
        </div>

        {/* Berichten lijst */}
        <div className="flex-1 overflow-y-auto bg-gray-50 scrollbar-thin">
          <div className="mx-6 my-4 space-y-4">
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
                      onForward={onForward}
                      onUnpin={onUnpin}
                      isPinned
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              {isError ? (
                <div className="p-8 text-center">
                  <p className="font-medium text-red-600">Kon berichten niet laden</p>
                  <p className="mt-1 text-sm text-gray-500">{error?.message || 'Onbekende fout'}</p>
                  <button
                    onClick={() => refetch()}
                    className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
                  >
                    Opnieuw proberen
                  </button>
                </div>
              ) : isLoading ? (
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
                      onMarkSpam={onMarkSpam}
                      onPin={onPin}
                      onForward={onForward}
                      onAsanaAction={onAsanaAction}
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
            onSpam={onBulkSpam ? async () => {
              const ok = await onBulkSpam([...selection.selectedIds], selectedMessages);
              if (ok !== false) selection.clear();
            } : undefined}
            onClear={selection.clear}
          />
        </div>
      </div>

      {/* RECHTER KOLOM: metrics + agenda */}
      <aside className="hidden w-[320px] shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-gray-50/60 scrollbar-thin lg:flex">
        <div className="space-y-1 px-4 pb-3 pt-5">
          <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
            Overzicht
          </div>
          <MetricRow
            label="Open"
            value={stats?.open_count}
            icon="fa-inbox"
            color="text-blue-600"
            onClick={() => setStatusFilter(null)}
            active={statusFilter === null}
          />
          <MetricRow
            label="Snoozed"
            value={stats?.snoozed_count}
            icon="fa-clock"
            color="text-orange-600"
            onClick={() => onNavigate?.('snoozed')}
          />
          <MetricRow
            label="Vandaag afgehandeld"
            value={stats?.done_today}
            icon="fa-circle-check"
            color="text-green-600"
            onClick={() => onNavigate?.('logboek')}
          />
          {stats?.urgent_count > 0 ? (
            <MetricRow
              label="Urgent"
              value={stats?.urgent_count}
              icon="fa-circle-exclamation"
              color="text-red-600"
              onClick={() => handleStatusFilter('urgent')}
              active={statusFilter === 'urgent'}
            />
          ) : null}
        </div>

        <div className="border-t border-gray-200" />

        <div className="p-4">
          <AgendaWidget onNavigate={onNavigate} onOpenContact={onOpenContact} />
        </div>
      </aside>
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
