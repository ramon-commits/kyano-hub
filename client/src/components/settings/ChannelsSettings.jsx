import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStatus, useChannels } from '../../hooks/useChannels.js';
import { api } from '../../lib/api.js';
import Badge from '../shared/Badge.jsx';
import ChannelBadge from '../shared/ChannelBadge.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { parseDateSafe, timeAgo } from '../../lib/utils.js';

export default function ChannelsSettings() {
  const { data: channelsData, isLoading } = useChannels();
  const { data: authData } = useAuthStatus();
  const toast = useToast();
  const qc = useQueryClient();

  const sync = useMutation({
    mutationFn: (id) => api.post(`/sync/${id}`),
    onSuccess: (data) => {
      toast.info(data.message || 'Sync gestart', '🔄 Sync');
      qc.invalidateQueries({ queryKey: ['channels'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const connect = async (channelId) => {
    try {
      const res = await api.get(`/auth/gmail/connect/${channelId}`);
      window.open(res.auth_url, '_blank', 'width=600,height=700');
      toast.info('Maak de OAuth flow af in het nieuwe venster', '🔐 Verbinden');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const disconnect = async (channelId) => {
    try {
      await api.delete(`/auth/gmail/${channelId}`);
      toast.success('Account ontkoppeld');
      qc.invalidateQueries({ queryKey: ['channels'] });
      qc.invalidateQueries({ queryKey: ['auth-status'] });
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <LoadingSpinner label="Kanalen laden…" />;

  const channels = channelsData?.channels || [];
  const authMap = new Map((authData?.accounts || []).map((a) => [a.id, a]));

  return (
    <div className="space-y-3">
      {channels.map((c) => {
        const isEmail = c.type === 'email';
        const auth = authMap.get(c.id);
        const connected = auth?.is_connected;

        return (
          <div key={c.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
            <ChannelBadge type={c.type} label={c.label} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-gray-900">{c.label}</div>
              <div className="mt-0.5 text-xs text-gray-500">
                {c.last_sync_at ? `Laatste sync: ${timeAgo(parseDateSafe(c.last_sync_at))} geleden` : 'Nog niet gesynchroniseerd'}
                {c.open_count > 0 ? ` · ${c.open_count} open` : ''}
              </div>
            </div>

            {isEmail ? (
              connected ? (
                <Badge color="#16a34a" bg="#f0fdf4">✅ Verbonden</Badge>
              ) : (
                <Badge color="#dc2626" bg="#fef2f2">❌ Niet verbonden</Badge>
              )
            ) : (
              <Badge color="#a16207" bg="#fef3c7">⚠️ Komt in stap 9</Badge>
            )}

            <div className="flex gap-2">
              {isEmail && !connected ? (
                <button
                  onClick={() => connect(c.id)}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                >
                  🔐 Verbinden
                </button>
              ) : null}
              {isEmail && connected ? (
                <button
                  onClick={() => disconnect(c.id)}
                  className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                >
                  Ontkoppel
                </button>
              ) : null}
              <button
                onClick={() => sync.mutate(c.id)}
                disabled={sync.isPending}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                🔄 Sync nu
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
