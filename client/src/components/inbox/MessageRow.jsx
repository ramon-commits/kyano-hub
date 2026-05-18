import Avatar from '../shared/Avatar.jsx';
import ChannelBadge from '../shared/ChannelBadge.jsx';
import PriorityBadge from '../shared/PriorityBadge.jsx';
import Badge from '../shared/Badge.jsx';
import { cn, timeAgo, formatDateShort, formatTime, parseDateSafe } from '../../lib/utils.js';

export default function MessageRow({ message, selected, onClick, onSnooze, onDone, onFastDone, onSchedule, onReopen, onArchive, onBlock, onPin, onUnpin, isPinned, showWakeUp, showDoneInfo, selectable, isSelected, onToggleSelect }) {
  const m = message;
  const isEmail = m.channel_type === 'email';

  return (
    <div
      onClick={onClick}
      className={cn(
        'group flex cursor-pointer items-center gap-4 border-b border-gray-100 px-5 py-[14px] transition-colors last:border-b-0',
        isSelected ? 'bg-blue-50' : selected ? 'bg-blue-50/60' : 'hover:bg-gray-50',
      )}
    >
      {selectable ? (
        <input
          type="checkbox"
          checked={!!isSelected}
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(m.id, e); }}
          onChange={() => { /* handled via onClick to capture shift key */ }}
          className="h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/30"
          aria-label={`Selecteer bericht van ${m.contact_name || 'onbekend'}`}
        />
      ) : null}

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
          {m.message_count > 1 ? (
            <span
              className="shrink-0 rounded-full bg-gray-100 px-1.5 py-px text-[11px] font-semibold leading-snug text-gray-600"
              title={`${m.message_count} berichten in deze conversatie`}
            >
              {m.message_count}
            </span>
          ) : null}
          <ChannelBadge type={m.channel_type} label={m.channel_label} size="xs" showLabel={false} />
          {m.priority === 'high' ? <PriorityBadge priority="high" size="xs" /> : null}
          {m.status === 'waiting' ? (
            <Badge color="#a16207" bg="#fef3c7" size="xs"><i className="fa-solid fa-hourglass-half mr-1" />Wacht op reactie</Badge>
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
            <i className="fa-solid fa-clock mr-1" />Komt terug: <strong>{formatDateShort(parseDateSafe(m.snoozed_until))} {formatTime(parseDateSafe(m.snoozed_until))}</strong>
          </div>
        ) : null}

        {showDoneInfo && m.done_at ? (
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <Badge color="#16a34a" bg="#dcfce7" size="xs"><i className="fa-solid fa-circle-check mr-1" />{m.done_category || 'afgehandeld'}</Badge>
            {m.done_note ? <span className="italic text-gray-600">&ldquo;{m.done_note}&rdquo;</span> : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isPinned ? (
          <button
            onClick={(e) => { e.stopPropagation(); onUnpin?.(m); }}
            title="Niet meer vastzetten"
            className="grid h-7 w-7 place-items-center rounded-md text-amber-500 transition-colors hover:bg-amber-50 hover:text-amber-700"
          >
            <i className="fa-solid fa-thumbtack text-sm" />
          </button>
        ) : null}
        <span className="text-xs text-gray-400 group-hover:hidden">{timeAgo(m.received_at)}</span>

        <div className="hidden items-center gap-0.5 group-hover:flex">
          {/* 1. Snel afvinken */}
          {onFastDone ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onFastDone(m); }} title="Snel afvinken (f)" hoverColor="hover:bg-emerald-50 hover:text-emerald-700">
              <i className="fa-solid fa-check" />
            </ActionBtn>
          ) : null}
          {/* 2. Archiveer */}
          {onArchive ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onArchive(m); }} title="Archiveer (e)" hoverColor="hover:bg-gray-100 hover:text-gray-700">
              <i className="fa-solid fa-box-archive" />
            </ActionBtn>
          ) : null}
          {/* 3. Blokkeer/spam */}
          {onBlock ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onBlock(m); }} title="Blokkeer afzender (x)" hoverColor="hover:bg-red-50 hover:text-red-700">
              <i className="fa-solid fa-ban" />
            </ActionBtn>
          ) : null}
          {/* 4. Plan afspraak */}
          {onSchedule ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onSchedule(m); }} title="Plan afspraak" hoverColor="hover:bg-blue-50 hover:text-blue-700">
              <i className="fa-solid fa-calendar-plus" />
            </ActionBtn>
          ) : null}
          {/* 5. Pin */}
          {onPin && !isPinned ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onPin(m); }} title="Vastzetten" hoverColor="hover:bg-amber-50 hover:text-amber-700">
              <i className="fa-solid fa-thumbtack" />
            </ActionBtn>
          ) : null}
          {/* Reopen blijft beschikbaar voor logboek/snoozed rijen */}
          {onReopen ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onReopen(m); }} title="Terug naar inbox" hoverColor="hover:bg-blue-50 hover:text-blue-700">
              <i className="fa-solid fa-reply" />
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
