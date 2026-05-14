import { useMemo, useState } from 'react';
import { useCalendarEvents } from '../../hooks/useCalendar.js';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import PageHeader from '../shared/PageHeader.jsx';
import { formatDateShort, formatTime, parseDateSafe, cn } from '../../lib/utils.js';

const CHANNEL_COLOR = {
  'gmail-1': { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
  'gmail-2': { bg: '#dcfce7', border: '#16a34a', text: '#166534' },
  'gmail-3': { bg: '#fff7ed', border: '#ea580c', text: '#9a3412' },
  'gmail-4': { bg: '#f5f3ff', border: '#7c3aed', text: '#6b21a8' },
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
  const calendarErrors = data?.errors || [];
  const apiDisabled = calendarErrors.find((e) => e.code === 'api_disabled');
  const scopeMissing = calendarErrors.find((e) => e.code === 'scope_missing' || e.code === 'reauth_required');

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
      <PageHeader
        title="Calendar"
        subtitle={`${formatDateShort(weekStart)} t/m ${formatDateShort(new Date(weekEnd.getTime() - 86400000))}`}
        actions={
          <>
            <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
              <button onClick={() => navigate(-1)} className="rounded-md px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50">←</button>
              <button
                onClick={() => setWeekStart(startOfWeek(new Date()))}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium',
                  isCurrentWeek ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50',
                )}
              >
                Vandaag
              </button>
              <button onClick={() => navigate(1)} className="rounded-md px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50">→</button>
            </div>
            {onScheduleNew ? (
              <button
                onClick={() => onScheduleNew()}
                className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                + Nieuw event
              </button>
            ) : null}
          </>
        }
      />

      <div className="flex-1 overflow-y-auto bg-gray-50 scrollbar-thin">
        <div className="mx-8 my-6 space-y-4">
          {apiDisabled ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <i className="fa-solid fa-triangle-exclamation" />Google Calendar API uitgeschakeld
              </div>
              <p className="mb-2">
                De Google Calendar API is niet geactiveerd in je Google Cloud project, dus events kunnen niet opgehaald worden.
                De OAuth tokens hebben wél de juiste scope — je hoeft niet opnieuw te verbinden, alleen de API aan te zetten.
              </p>
              <a
                href={apiDisabled.enable_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
              >
                <i className="fa-solid fa-up-right-from-square" />
                Open Google Cloud Console
              </a>
              <p className="mt-2 text-xs text-amber-700">Na inschakelen: wacht 1-2 minuten en herlaad deze pagina.</p>
            </div>
          ) : scopeMissing ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <i className="fa-solid fa-triangle-exclamation mr-1.5" />
              Calendar-toegang ontbreekt — verbind je email-accounts opnieuw via <strong>Instellingen → Kanalen</strong>.
            </div>
          ) : null}
          {isLoading ? (
            <div className="rounded-xl border border-gray-200 bg-white py-12"><LoadingSpinner label="Calendar laden…" /></div>
          ) : isError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <i className="fa-solid fa-triangle-exclamation mr-1.5" />Calendar sync mislukt: {error?.message || 'Onbekende fout'}. Controleer of je Gmail-account verbonden is in Instellingen.
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white">
              <EmptyState
                icon="calendar"
                title="Geen afspraken deze week"
                description="Geen events gevonden in de gekoppelde calendars."
              />
            </div>
          ) : (
            byDay.map(({ date, events: dayEvents }) => {
              const isToday = isSameDay(date, today);
              return (
                <section key={date.toISOString()} className={cn('rounded-xl border bg-white p-5 shadow-sm', isToday ? 'border-blue-300 ring-1 ring-blue-100' : 'border-gray-200')}>
                  <div className="mb-3 flex items-baseline gap-2">
                    <h3 className={cn('text-sm font-semibold', isToday ? 'text-blue-700' : 'text-gray-900')}>
                      {DAYS_NL_LONG[date.getDay()]} {date.getDate()}
                    </h3>
                    {isToday ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">Vandaag</span> : null}
                    <span className="ml-auto text-[11px] text-gray-400">{dayEvents.length} event{dayEvents.length === 1 ? '' : 's'}</span>
                  </div>
                  {dayEvents.length === 0 ? (
                    <div className="rounded-md bg-gray-50 px-3 py-2 text-center text-xs text-gray-400">Geen events</div>
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
                            className="flex items-center gap-3 rounded-r-lg border-l-4 bg-white px-3 py-2 transition-shadow hover:shadow-md"
                            style={{ borderLeftColor: c.border, backgroundColor: c.bg, color: c.text }}
                          >
                            <span className="font-mono text-xs font-medium">
                              {e.all_day ? 'hele dag' : formatTime(parseDateSafe(e.start))}
                            </span>
                            <span className="flex-1 truncate text-sm font-medium">{e.title}</span>
                            {e.location ? <span className="text-xs opacity-70"><i className="fa-solid fa-location-dot mr-1" />{e.location}</span> : null}
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
