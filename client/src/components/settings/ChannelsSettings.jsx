import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStatus, useChannels } from '../../hooks/useChannels.js';
import { useSyncChannel } from '../../hooks/useMessages.js';
import { api } from '../../lib/api.js';
import Badge from '../shared/Badge.jsx';
import ChannelBadge from '../shared/ChannelBadge.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import ConfirmModal from '../modals/ConfirmModal.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { parseDateSafe, timeAgo, cn } from '../../lib/utils.js';

function StatusDot({ kind }) {
  const colors = {
    connected: 'bg-green-500',
    error: 'bg-amber-400',
    disconnected: 'bg-red-500',
    pending: 'bg-amber-400',
  };
  return <span className={cn('h-2 w-2 shrink-0 rounded-full', colors[kind])} />;
}

export default function ChannelsSettings() {
  const { data: channelsData, isLoading } = useChannels();
  const { data: authData } = useAuthStatus();
  const toast = useToast();
  const qc = useQueryClient();
  const syncMut = useSyncChannel();
  const [confirmDisconnect, setConfirmDisconnect] = useState(null);

  const connect = (channelId) => {
    window.open(`/api/auth/gmail/connect/${channelId}`, 'oauth', 'width=600,height=720');
    toast.info('Maak de Google consent flow af in het nieuwe venster', 'Verbinden');
    setTimeout(() => {
      qc.invalidateQueries({ queryKey: ['auth-status'] });
      qc.invalidateQueries({ queryKey: ['channels'] });
    }, 3000);
  };

  const doDisconnect = async (channelId) => {
    try {
      await api.delete(`/auth/gmail/${channelId}`);
      toast.success('Account ontkoppeld');
      qc.invalidateQueries({ queryKey: ['channels'] });
      qc.invalidateQueries({ queryKey: ['auth-status'] });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const doSync = async (channelId) => {
    try {
      const r = await syncMut.mutateAsync(channelId);
      if (r.ok === false) {
        toast.error(r.error || 'Sync mislukt');
      } else {
        const n = r.inserted ?? 0;
        toast.success(`Sync klaar — ${n} nieuwe bericht${n === 1 ? '' : 'en'}`, 'Sync');
      }
    } catch (e) {
      if (e.status === 401 || e.data?.needs_reconnect) {
        toast.error('Token verlopen — verbind opnieuw', 'Herconnectie nodig');
      } else {
        toast.error(e.message);
      }
    }
  };

  if (isLoading) return <LoadingSpinner label="Kanalen laden…" />;

  const channels = channelsData?.channels || [];
  const authMap = new Map((authData?.accounts || []).map((a) => [a.id, a]));

  // Alleen email channels in deze sectie; Unipile staat onder
  const emailChannels = channels.filter((c) => c.type === 'email');

  return (
    <div className="space-y-2">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
        Email accounts
      </div>
      {emailChannels.map((c) => {
        const auth = authMap.get(c.id);
        const connected = auth?.is_connected;
        const hasError = c.has_error || false;
        const statusKind = hasError ? 'error' : (connected ? 'connected' : 'disconnected');

        return (
          <div
            key={c.id}
            className={cn(
              'flex flex-wrap items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md',
              hasError ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200',
            )}
          >
            <StatusDot kind={statusKind} />
            <ChannelBadge type={c.type} label={c.label} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-gray-900">{c.label}</div>
              <div className="mt-0.5 text-xs text-gray-500">
                {c.last_sync_at ? (
                  <>Laatste sync: {timeAgo(parseDateSafe(c.last_sync_at))} geleden</>
                ) : connected ? (
                  <span className="text-blue-600">Nog niet gesynchroniseerd</span>
                ) : (
                  <>Nog niet verbonden</>
                )}
                {c.message_count > 0 ? <> · {c.message_count} berichten ({c.open_count || 0} open)</> : null}
              </div>
              {hasError ? (
                <div className="mt-1 text-[11px] font-medium text-amber-700"><i className="fa-solid fa-triangle-exclamation mr-1" />{c.error_message}</div>
              ) : null}
            </div>

            {hasError ? (
              <Badge color="#a16207" bg="#fef3c7"><i className="fa-solid fa-triangle-exclamation mr-1" />Herconnectie nodig</Badge>
            ) : connected ? (
              <Badge color="#16a34a" bg="#dcfce7"><i className="fa-solid fa-circle-check mr-1" />Verbonden</Badge>
            ) : (
              <Badge color="#dc2626" bg="#fef2f2"><i className="fa-solid fa-circle-xmark mr-1" />Niet verbonden</Badge>
            )}

            <div className="flex flex-wrap gap-1.5">
              {!connected && !hasError ? (
                <button
                  onClick={() => connect(c.id)}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  <i className="fa-solid fa-lock mr-1.5" />Verbinden
                </button>
              ) : null}
              {hasError ? (
                <button
                  onClick={() => connect(c.id)}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
                >
                  <i className="fa-solid fa-arrows-rotate mr-1.5" />Herverbinden
                </button>
              ) : null}
              {connected ? (
                <>
                  <button
                    onClick={() => doSync(c.id)}
                    disabled={syncMut.isPending}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    {syncMut.isPending && syncMut.variables === c.id ? (<><i className="fa-solid fa-hourglass-half mr-1.5" />Sync…</>) : (<><i className="fa-solid fa-arrows-rotate mr-1.5" />Sync nu</>)}
                  </button>
                  <button
                    onClick={() => setConfirmDisconnect({ id: c.id, label: c.label })}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                  >
                    Ontkoppel
                  </button>
                </>
              ) : null}
            </div>
          </div>
        );
      })}

      <ConfirmModal
        open={!!confirmDisconnect}
        onClose={() => setConfirmDisconnect(null)}
        onConfirm={() => doDisconnect(confirmDisconnect.id)}
        title="Account ontkoppelen?"
        message={`Weet je zeker dat je ${confirmDisconnect?.label} wilt ontkoppelen? Berichten blijven bewaard, maar je krijgt geen nieuwe meer binnen tot je opnieuw verbindt.`}
        confirmLabel="Ja, ontkoppel"
        cancelLabel="Annuleren"
        variant="danger"
      />
    </div>
  );
}
