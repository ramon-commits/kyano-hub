import { useEffect, useState } from 'react';
import { useStats } from '../../hooks/useStats.js';
import { useChannels } from '../../hooks/useChannels.js';
import { NAV_ITEMS, NAV_GROUPS } from '../../lib/constants.js';
import { cn } from '../../lib/utils.js';
import Icon from '../shared/Icon.jsx';

const NAV_BY_ID = Object.fromEntries(NAV_ITEMS.map((n) => [n.id, n]));

function dotFor(channel) {
  if (channel.type === 'email') {
    if (channel.has_error) return 'bg-amber-400';
    if (channel.is_connected) return 'bg-green-500';
    return 'bg-red-500';
  }
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

  // Auto-collapse onder 768px, user kan toggelen
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [userOverride, setUserOverride] = useState(false);

  useEffect(() => {
    if (userOverride) return; // user heeft handmatig getoggled — niet overschrijven
    const onResize = () => setCollapsed(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [userOverride]);

  const toggle = (next) => { setCollapsed(next); setUserOverride(true); };

  return (
    <aside
      className={cn(
        'flex h-screen shrink-0 flex-col text-sm transition-[width] duration-200',
        collapsed ? 'w-[64px]' : 'w-[220px]',
      )}
      style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)' }}
    >
      <div className={cn('flex items-center gap-3 py-5', collapsed ? 'justify-center px-2' : 'px-5')}>
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-bold text-white"
          style={{ background: 'var(--accent)' }}
        >
          K
        </div>
        {!collapsed ? (
          <div className="leading-tight">
            <div className="font-semibold text-white">Comm Hub</div>
            <div className="text-[11px] opacity-60">Kyano Horaizon</div>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 scrollbar-thin">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} className={gi === 0 ? '' : 'mt-4'}>
            {!collapsed ? (
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-40">
                {group.label}
              </div>
            ) : null}
            {group.items.map((id) => {
              const item = NAV_BY_ID[id];
              if (!item) return null;
              const isActive = active === item.id;
              const badge = item.badgeKey ? stats?.[item.badgeKey] : null;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
                  className={cn(
                    'mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-all',
                    collapsed ? 'justify-center' : '',
                    isActive ? 'text-white shadow-sm' : 'hover:bg-white/5 hover:text-white',
                  )}
                  style={isActive ? { background: 'var(--accent)' } : undefined}
                >
                  <Icon name={item.icon} className="text-base" />
                  {!collapsed ? (
                    <>
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
                    </>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {!collapsed ? (
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
      ) : null}

      <div className={cn('border-t border-white/5 py-4', collapsed ? 'flex justify-center px-2' : 'px-5')}>
        {collapsed ? (
          <button
            onClick={() => toggle(false)}
            className="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-white hover:opacity-90"
            style={{ background: 'var(--accent)' }}
            title="Uitklappen"
          >
            RB
          </button>
        ) : (
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
            <button
              onClick={() => toggle(true)}
              className="ml-auto grid h-6 w-6 place-items-center rounded-md opacity-50 hover:bg-white/10 hover:opacity-100"
              title="Inklappen"
            >
              <Icon name="angles-left" className="text-xs" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
