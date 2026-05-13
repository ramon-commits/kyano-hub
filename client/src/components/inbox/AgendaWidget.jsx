import { useMemo } from 'react';
import { useCalendarEvents } from '../../hooks/useCalendar.js';
import { useBirthdays, useNudges } from '../../hooks/useContacts.js';
import { formatTime, parseDateSafe, isSameDay } from '../../lib/utils.js';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function isoDate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

const DAY_LABEL = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MONTH_LABEL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function dateLabel(d) {
  return `${DAY_LABEL[d.getDay()]} ${d.getDate()} ${MONTH_LABEL[d.getMonth()]}`;
}

function eventDurationMinutes(e) {
  const s = parseDateSafe(e.start);
  const en = parseDateSafe(e.end);
  if (!s || !en) return null;
  return Math.round((en - s) / 60000);
}

function formatDuration(minutes) {
  if (minutes == null) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}u ${m}m` : `${h}u`;
}

export default function AgendaWidget({ onNavigate, onOpenContact }) {
  // 7-dagen venster vanaf vandaag 00:00
  const today = useMemo(() => startOfToday(), []);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);
  const weekEnd = useMemo(() => addDays(today, 7), [today]);

  const { data: eventsData, isLoading } = useCalendarEvents(isoDate(today), isoDate(weekEnd));
  const { data: birthdaysData } = useBirthdays(2);
  const { data: nudgesData } = useNudges();

  const allEvents = eventsData?.events || [];
  const birthdays = birthdaysData?.birthdays || [];
  const nudgesCount = (nudgesData?.nudges || []).length;

  // Groepeer events
  const { todayEvents, tomorrowEvents, weekEvents } = useMemo(() => {
    const a = [], b = [], c = [];
    for (const e of allEvents) {
      const start = parseDateSafe(e.start);
      if (!start) continue;
      if (isSameDay(start, today)) a.push(e);
      else if (isSameDay(start, tomorrow)) b.push(e);
      else if (start > tomorrow && start < weekEnd) c.push(e);
    }
    const byStart = (x, y) => new Date(x.start) - new Date(y.start);
    a.sort(byStart);
    b.sort(byStart);
    c.sort(byStart);
    return { todayEvents: a, tomorrowEvents: b, weekEvents: c.slice(0, 5) };
  }, [allEvents, today, tomorrow, weekEnd]);

  const birthdayToday = birthdays.filter((c) => c.days_until === 0);
  const birthdayTomorrow = birthdays.filter((c) => c.days_until === 1);

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <i className="fa-solid fa-calendar-days text-blue-600" />
          Agenda
        </h3>
        <button
          onClick={() => onNavigate?.('calendar')}
          className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-700"
        >
          Bekijk alles →
        </button>
      </div>

      {/* Vandaag */}
      <Section label="Vandaag">
        {isLoading ? (
          <div className="px-2 py-2 text-xs text-gray-400">Laden…</div>
        ) : todayEvents.length === 0 ? (
          <div className="px-2 py-2 text-xs text-gray-400">Geen afspraken vandaag</div>
        ) : (
          todayEvents.map((e) => <EventRow key={e.id} event={e} />)
        )}
      </Section>

      {/* Morgen */}
      {tomorrowEvents.length > 0 ? (
        <Section label="Morgen">
          {tomorrowEvents.map((e) => <EventRow key={e.id} event={e} />)}
        </Section>
      ) : null}

      {/* Komende week */}
      {weekEvents.length > 0 ? (
        <Section label="Komende week">
          {weekEvents.map((e) => <CompactEventRow key={e.id} event={e} />)}
        </Section>
      ) : null}

      {/* Verjaardagen */}
      {(birthdayToday.length > 0 || birthdayTomorrow.length > 0) ? (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Verjaardagen
          </div>
          {birthdayToday.map((c) => (
            <div key={c.id} className="mb-1.5 flex items-center gap-2 rounded-md bg-pink-50 px-2 py-1.5">
              <i className="fa-solid fa-cake-candles text-pink-600" />
              <span className="flex-1 truncate text-sm">
                <strong className="text-pink-900">{c.name}</strong>
                <span className="ml-1 text-pink-700">is vandaag jarig!</span>
              </span>
              <button
                onClick={() => onOpenContact?.(c)}
                className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-pink-700 ring-1 ring-pink-200 transition-colors hover:bg-pink-100"
              >
                Feliciteren
              </button>
            </div>
          ))}
          {birthdayTomorrow.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpenContact?.(c)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-gray-50"
            >
              <i className="fa-solid fa-cake-candles text-gray-400" />
              <span className="truncate">
                Morgen: <strong className="text-gray-900">{c.name}</strong>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Nudges hint */}
      {nudgesCount > 0 ? (
        <button
          onClick={() => onNavigate?.('nudges')}
          className="mt-3 flex w-full items-center gap-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 transition-colors hover:bg-amber-100"
        >
          <i className="fa-solid fa-bell text-amber-500" />
          <span className="flex-1">
            <strong>{nudgesCount}</strong> contact{nudgesCount === 1 ? '' : 'en'} wacht{nudgesCount === 1 ? '' : 'en'} op een berichtje
          </span>
          <i className="fa-solid fa-arrow-right text-amber-400" />
        </button>
      ) : null}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function EventRow({ event }) {
  const start = parseDateSafe(event.start);
  const minutes = eventDurationMinutes(event);
  const calendarName = event.calendar_summary || event.organizer?.email || '';
  return (
    <a
      href={event.html_link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-baseline gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-50"
    >
      <span className="w-12 shrink-0 font-mono text-xs font-semibold text-blue-600">
        {event.all_day ? 'hele dag' : formatTime(start)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-gray-900">{event.title || '(geen titel)'}</div>
        {(minutes || calendarName) ? (
          <div className="truncate text-[11px] text-gray-500">
            {minutes ? formatDuration(minutes) : ''}
            {minutes && calendarName ? ' · ' : ''}
            {calendarName}
          </div>
        ) : null}
      </div>
    </a>
  );
}

function CompactEventRow({ event }) {
  const start = parseDateSafe(event.start);
  return (
    <a
      href={event.html_link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-gray-50"
    >
      <span className="w-20 shrink-0 truncate font-mono font-medium text-gray-600">
        {start ? dateLabel(start) : ''}
      </span>
      <span className="min-w-0 flex-1 truncate text-gray-700">
        <span className="font-medium text-blue-600">
          {event.all_day ? '' : `${formatTime(start)} · `}
        </span>
        {event.title || '(geen titel)'}
      </span>
    </a>
  );
}
