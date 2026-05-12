import Avatar from '../shared/Avatar.jsx';
import ChannelBadge from '../shared/ChannelBadge.jsx';
import PriorityBadge from '../shared/PriorityBadge.jsx';
import { cn, timeAgo } from '../../lib/utils.js';

export default function MessageRow({ message, selected, onClick, onSnooze, onDone, onSchedule, onReopen, onArchive, showWakeUp, showDoneInfo }) {
  const m = message;
  const isEmail = m.channel_type === 'email';

  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex cursor-pointer items-center gap-4 border-b border-gray-100 px-5 py-3.5 transition-colors',
        selected ? 'bg-blue-50/60' : 'hover:bg-gray-50',
      )}
    >
      <Avatar
        name={m.contact_name}
        initials={m.contact_initials}
        color={m.contact_color}
        size="md"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-gray-900">
            {m.contact_name || m.channel_account || 'Onbekend'}
          </span>
          <ChannelBadge type={m.channel_type} label={m.channel_label} size="xs" showLabel={false} />
          {m.priority === 'high' ? <PriorityBadge priority="high" size="xs" /> : null}
          {m.status === 'waiting' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              ⏳ Wacht op reactie
            </span>
          ) : null}
        </div>

        <div className="mt-0.5 flex items-baseline gap-2 text-sm">
          {isEmail && m.subject ? (
            <span className="truncate font-medium text-gray-800">{m.subject}</span>
          ) : null}
          <span className="truncate text-gray-500">
            {isEmail && m.subject ? '— ' : ''}{m.snippet}
          </span>
        </div>

        {showWakeUp && m.snoozed_until ? (
          <div className="mt-1 text-[11px] text-amber-700">
            ⏰ Komt terug: <strong>{new Date(m.snoozed_until).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong>
          </div>
        ) : null}

        {showDoneInfo && m.done_at ? (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-600">
            <span className="rounded-full bg-green-50 px-1.5 py-0.5 font-medium text-green-700">
              ✅ {m.done_category || 'afgehandeld'}
            </span>
            {m.done_note ? <span className="italic">&ldquo;{m.done_note}&rdquo;</span> : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="text-xs text-gray-400 group-hover:hidden">{timeAgo(m.received_at)}</span>

        <div className="hidden items-center gap-1 group-hover:flex">
          {onSnooze ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onSnooze(m); }} title="Snooze" hoverColor="hover:bg-orange-50 hover:text-orange-700">
              ⏰
            </ActionBtn>
          ) : null}
          {onDone ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onDone(m); }} title="Afhandelen" hoverColor="hover:bg-green-50 hover:text-green-700">
              ✅
            </ActionBtn>
          ) : null}
          {onSchedule ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onSchedule(m); }} title="Plan afspraak" hoverColor="hover:bg-blue-50 hover:text-blue-700">
              📅
            </ActionBtn>
          ) : null}
          {onReopen ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onReopen(m); }} title="Terug naar inbox" hoverColor="hover:bg-blue-50 hover:text-blue-700">
              ↩
            </ActionBtn>
          ) : null}
          {onArchive ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onArchive(m); }} title="Archiveer" hoverColor="hover:bg-gray-200 hover:text-gray-900">
              🗑️
            </ActionBtn>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, title, hoverColor }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`grid h-8 w-8 place-items-center rounded-md text-base text-gray-500 transition-colors ${hoverColor || 'hover:bg-gray-100'}`}
    >
      {children}
    </button>
  );
}
