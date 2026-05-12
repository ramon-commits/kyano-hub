import { useStats } from '../../hooks/useStats.js';
import { useChannels } from '../../hooks/useChannels.js';

const NAV = [
  { id: 'inbox', icon: '📬', label: 'Inbox', badgeKey: 'open_count' },
  { id: 'snoozed', icon: '⏰', label: 'Snoozed', badgeKey: 'snoozed_count' },
  { id: 'logboek', icon: '📋', label: 'Logboek' },
  { id: 'contacten', icon: '👥', label: 'Contacten' },
  { id: 'verjaardagen', icon: '🎂', label: 'Verjaardagen', badgeKey: 'birthdays_week' },
  { id: 'nudges', icon: '💡', label: 'Nudges', badgeKey: 'nudges_count' },
  { id: 'calendar', icon: '📅', label: 'Calendar' },
  { id: 'projecten', icon: '🗂️', label: 'Projecten' },
  { id: 'analytics', icon: '📊', label: 'Analytics' },
  { id: 'ask', icon: '💬', label: 'Vraag (AI)' },
  { id: 'instellingen', icon: '⚙️', label: 'Instellingen' },
];

const CHANNEL_DOTS = {
  email: 'bg-red-500',
  whatsapp: 'bg-green-500',
  instagram: 'bg-pink-500',
  linkedin: 'bg-blue-500',
};

export default function Sidebar({ active, onSelect }) {
  const { data: stats } = useStats();
  const { data: channelsData } = useChannels();
  const channels = channelsData?.channels || [];

  return (
    <aside
      className="flex h-screen w-[220px] flex-col text-sm"
      style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)' }}
    >
      {/* Logo */}
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

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5">
        {NAV.map((item) => {
          const isActive = active === item.id;
          const badge = item.badgeKey ? stats?.[item.badgeKey] : null;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                isActive ? 'text-white' : 'hover:bg-white/5 hover:text-white'
              }`}
              style={isActive ? { background: 'var(--accent)', color: 'white' } : undefined}
            >
              <span className="text-base">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {badge ? (
                <span
                  className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-medium ${
                    isActive ? 'bg-white/25 text-white' : 'bg-white/10 text-white'
                  }`}
                >
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Kanalen */}
      <div className="border-t border-white/5 px-2.5 py-3">
        <div className="px-3 pb-2 text-[10px] font-medium uppercase tracking-wider opacity-50">
          Kanalen
        </div>
        <div className="space-y-0.5">
          {channels.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs hover:bg-white/5"
              title={c.label}
            >
              <span
                className={`h-2 w-2 rounded-full ${CHANNEL_DOTS[c.type] || 'bg-gray-500'} ${
                  c.is_connected || c.type === 'whatsapp' ? '' : 'opacity-40'
                }`}
              />
              <span className="flex-1 truncate">{c.label}</span>
              {c.open_count > 0 ? (
                <span className="text-[10px] opacity-60">{c.open_count}</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* User */}
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
