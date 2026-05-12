import { useStats } from '../../hooks/useStats.js';
import { useChannels } from '../../hooks/useChannels.js';
import { NAV_ITEMS } from '../../lib/constants.js';
import { cn } from '../../lib/utils.js';

function dotFor(channel) {
  // Email channels: groen=connected+ok, geel=error, rood=niet verbonden
  if (channel.type === 'email') {
    if (channel.has_error) return 'bg-amber-400';
    if (channel.is_connected) return 'bg-green-500';
    return 'bg-red-500';
  }
  // WhatsApp: groen als active (real sync komt stap 9)
  if (channel.type === 'whatsapp') return 'bg-green-500';
  if (channel.type === 'instagram') return 'bg-pink-500';
  if (channel.type === 'linkedin') return 'bg-blue-500';
  return 'bg-gray-500';
}

function dotTitle(channel) {
  if (channel.type !== 'email') return `${channel.label} (placeholder)`;
  if (channel.has_error) return `${channel.label} — ${channel.error_message || 'Herconnectie nodig'}`;
  if (channel.is_connected) return `${channel.label} — verbonden`;
  return `${channel.label} — niet verbonden`;
}

export default function Sidebar({ active, onSelect }) {
  const { data: stats } = useStats();
  const { data: channelsData } = useChannels();
  const channels = channelsData?.channels || [];

  return (
    <aside
      className="flex h-screen w-[220px] shrink-0 flex-col text-sm"
      style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)' }}
    >
      <div className="flex items-center gap-3 px-5 py-5">
        <div
          className="grid h-9 w-9 place-items-center rounded-lg font-bold text-white"
          style={{ background: 'var(--accent)' }}
        >
          K
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-white">Comm Hub</div>
          <div className="text-[11px] opacity-60">Kyano Horaizon</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 scrollbar-thin">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id;
          const badge = item.badgeKey ? stats?.[item.badgeKey] : null;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
              className={cn(
                'mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-all',
                isActive ? 'text-white shadow-sm' : 'hover:bg-white/5 hover:text-white',
              )}
              style={isActive ? { background: 'var(--accent)' } : undefined}
            >
              <span className="text-base">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {badge ? (
                <span
                  className={cn(
                    'min-w-5 rounded-full px-1.5 text-center text-[11px] font-medium',
                    isActive ? 'bg-white/25 text-white' : 'bg-white/10 text-white',
                  )}
                >
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/5 px-2.5 py-3">
        <div className="px-3 pb-2 text-[10px] font-medium uppercase tracking-wider opacity-50">
          Kanalen
        </div>
        <div className="space-y-0.5">
          {channels.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs hover:bg-white/5"
              title={dotTitle(c)}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  dotFor(c),
                  c.type === 'email' && !c.is_connected ? 'opacity-50' : '',
                )}
              />
              <span className="flex-1 truncate">{c.label}</span>
              {c.open_count > 0 ? (
                <span className="text-[10px] opacity-60">{c.open_count}</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/5 px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-white"
            style={{ background: 'var(--accent)' }}
          >
            RB
          </div>
          <div className="leading-tight">
            <div className="text-sm font-medium text-white">Ramon</div>
            <div className="text-[11px] opacity-60">Endless Minds</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
