import { useCalendarToday } from '../../hooks/useCalendar.js';
import { formatTime, parseDateSafe } from '../../lib/utils.js';

export default function TodayWidget() {
  const { data, isError } = useCalendarToday();
  const events = data?.events || [];

  if (isError) return null;
  if (events.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
          📅 Vandaag — {events.length} meeting{events.length === 1 ? '' : 's'}
        </h3>
      </div>
      <div className="space-y-1.5">
        {events.slice(0, 4).map((e) => (
          <a
            key={e.id}
            href={e.html_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-gray-50"
          >
            <span className="font-mono text-xs font-medium text-blue-700">
              {e.all_day ? 'hele dag' : formatTime(parseDateSafe(e.start))}
            </span>
            <span className="flex-1 truncate text-gray-900">{e.title}</span>
            {e.attendees?.length ? (
              <span className="text-xs text-gray-500">
                met {e.attendees[0].displayName || e.attendees[0].email}
              </span>
            ) : null}
          </a>
        ))}
        {events.length > 4 ? (
          <div className="px-2 text-xs text-gray-500">+ {events.length - 4} meer events</div>
        ) : null}
      </div>
    </div>
  );
}
