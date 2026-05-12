import { useMemo, useState } from 'react';
import { useCalendarEvents } from '../../hooks/useCalendar.js';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import { formatDateShort, formatTime, parseDateSafe, cn } from '../../lib/utils.js';

const CHANNEL_COLOR = {
  'gmail-1': { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  'gmail-2': { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
  'gmail-3': { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412' },
  'gmail-4': { bg: '#f5f3ff', border: '#ddd6fe', text: '#6b21a8' },
};

const DAYS_NL_LONG = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay() || 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day + 1);
  return x;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function CalendarView({ onScheduleNew }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart);
    e.setDate(e.getDate() + 7);
    return e;
  }, [weekStart]);

  const { data, isLoading, isError, error } = useCalendarEvents(weekStart.toISOString(), weekEnd.toISOString());
  const events = data?.events || [];

  // Group by day
  const byDay = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
    return days.map((d) => ({
      date: d,
      events: events.filter((e) => isSameDay(parseDateSafe(e.start), d)),
    }));
  }, [events, weekStart]);

  const today = new Date();

  const navigate = (delta) => {
    const ns = new Date(weekStart);
    ns.setDate(ns.getDate() + delta * 7);
    setWeekStart(ns);
  };

  const isCurrentWeek = isSameDay(weekStart, startOfWeek(today));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-8 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">📅 Calendar</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {formatDateShort(weekStart)} t/m {formatDateShort(new Date(weekEnd.getTime() - 86400000))}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">← Vorige</button>
            <button
              onClick={() => setWeekStart(startOfWeek(new Date()))}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                isCurrentWeek ? 'bg-blue-100 text-blue-700' : 'border border-gray-200 bg-white hover:bg-gray-50',
              )}
            >
              Vandaag
            </button>
            <button onClick={() => navigate(1)} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">Volgende →</button>
            {onScheduleNew ? (
              <button
                onClick={() => onScheduleNew()}
                className="ml-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                + Nieuw event
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-8 my-6 space-y-4">
          {isLoading ? (
            <div className="rounded-xl border border-gray-200 bg-white py-12"><LoadingSpinner label="Calendar laden…" /></div>
          ) : isError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              ⚠️ Calendar sync mislukt: {error?.message || 'Onbekende fout'}. Controleer of je Gmail-account verbonden is in Instellingen.
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white">
              <EmptyState
                icon="📆"
                title="Geen afspraken deze week"
                description="Geen events gevonden in de gekoppelde calendars."
              />
            </div>
          ) : (
            byDay.map(({ date, events: dayEvents }) => {
              const isToday = isSameDay(date, today);
              return (
                <section key={date.toISOString()} className={cn('rounded-xl border bg-white p-4 shadow-sm', isToday ? 'border-blue-300' : 'border-gray-200')}>
                  <div className="mb-3 flex items-baseline gap-2">
                    <h3 className={cn('text-sm font-semibold', isToday ? 'text-blue-700' : 'text-gray-900')}>
                      {DAYS_NL_LONG[date.getDay()]} {date.getDate()}
                    </h3>
                    {isToday ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">Vandaag</span> : null}
                    <span className="text-xs text-gray-400">· {dayEvents.length} event{dayEvents.length === 1 ? '' : 's'}</span>
                  </div>
                  {dayEvents.length === 0 ? (
                    <div className="text-xs text-gray-400">— Geen afspraken</div>
                  ) : (
                    <div className="space-y-1.5">
                      {dayEvents.map((e) => {
                        const c = CHANNEL_COLOR[e.channel_id] || { bg: '#f3f4f6', border: '#e5e7eb', text: '#374151' };
                        return (
                          <a
                            key={e.id}
                            href={e.html_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 rounded-md border px-3 py-2 transition-shadow hover:shadow-sm"
                            style={{ background: c.bg, borderColor: c.border, color: c.text }}
                          >
                            <span className="font-mono text-xs font-medium" style={{ color: c.text }}>
                              {e.all_day ? 'hele dag' : formatTime(parseDateSafe(e.start))}
                            </span>
                            <span className="flex-1 truncate text-sm font-medium">{e.title}</span>
                            {e.location ? <span className="text-xs opacity-70">📍 {e.location}</span> : null}
                            <span className="text-[10px] opacity-60">{e.calendar_email?.split('@')[0]}</span>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
