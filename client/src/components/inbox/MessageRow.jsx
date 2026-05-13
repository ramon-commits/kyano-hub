import Avatar from '../shared/Avatar.jsx';
import ChannelBadge from '../shared/ChannelBadge.jsx';
import PriorityBadge from '../shared/PriorityBadge.jsx';
import Badge from '../shared/Badge.jsx';
import { cn, timeAgo, formatDateShort, formatTime, parseDateSafe } from '../../lib/utils.js';

export default function MessageRow({ message, selected, onClick, onSnooze, onDone, onSchedule, onReopen, onArchive, onBlock, showWakeUp, showDoneInfo }) {
  const m = message;
  const isEmail = m.channel_type === 'email';

  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex cursor-pointer items-center gap-4 border-b border-gray-100 px-5 py-[14px] transition-colors last:border-b-0',
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
          <span className="truncate text-sm font-semibold text-gray-900">
            {m.contact_name || m.channel_account || 'Onbekend'}
          </span>
          <ChannelBadge type={m.channel_type} label={m.channel_label} size="xs" showLabel={false} />
          {m.priority === 'high' ? <PriorityBadge priority="high" size="xs" /> : null}
          {m.status === 'waiting' ? (
            <Badge color="#a16207" bg="#fef3c7" size="xs">⏳ Wacht op reactie</Badge>
          ) : null}
        </div>

        <div className="mt-0.5 flex items-baseline gap-1.5 text-[13px]">
          {isEmail && m.subject ? (
            <span className="truncate font-medium text-gray-800">{m.subject}</span>
          ) : null}
          <span className="truncate text-gray-500">
            {isEmail && m.subject ? '— ' : ''}{m.snippet}
          </span>
        </div>

        {showWakeUp && m.snoozed_until ? (
          <div className="mt-1 text-[11px] text-orange-700">
            ⏰ Komt terug: <strong>{formatDateShort(parseDateSafe(m.snoozed_until))} {formatTime(parseDateSafe(m.snoozed_until))}</strong>
          </div>
        ) : null}

        {showDoneInfo && m.done_at ? (
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <Badge color="#16a34a" bg="#dcfce7" size="xs">✅ {m.done_category || 'afgehandeld'}</Badge>
            {m.done_note ? <span className="italic text-gray-600">&ldquo;{m.done_note}&rdquo;</span> : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="text-xs text-gray-400 group-hover:hidden">{timeAgo(m.received_at)}</span>

        <div className="hidden items-center gap-0.5 group-hover:flex">
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
          {onBlock && m.contact_email ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onBlock(m); }} title="Blokkeer afzender" hoverColor="hover:bg-red-50 hover:text-red-700">
              🚫
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
