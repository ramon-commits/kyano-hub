import { useMemo } from 'react';
import { formatDateShort, parseDateSafe } from '../../lib/utils.js';

const DAYS_NL = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

function getWeekDays() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export default function CalendarView() {
  const days = useMemo(() => getWeekDays(), []);
  const today = new Date();
  const isToday = (d) => d.toDateString() === today.toDateString();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-8 py-5">
        <h1 className="text-xl font-semibold text-gray-900">📅 Calendar</h1>
        <p className="mt-0.5 text-sm text-gray-500">Deze week — {formatDateShort(days[0])} t/m {formatDateShort(days[6])}</p>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin">
        <div className="mx-8 my-6 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="rounded-t-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
            ℹ️ Calendar wordt gekoppeld in stap 8. Hier verschijnen straks je afspraken uit Google Calendar.
          </div>

          <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-gray-100">
            <div />
            {days.map((d, i) => (
              <div
                key={i}
                className={`border-l border-gray-100 px-2 py-3 text-center ${isToday(d) ? 'bg-blue-50' : ''}`}
              >
                <div className={`text-[10px] uppercase tracking-wider ${isToday(d) ? 'text-blue-700' : 'text-gray-400'}`}>
                  {DAYS_NL[i]}
                </div>
                <div className={`text-lg font-semibold ${isToday(d) ? 'text-blue-700' : 'text-gray-900'}`}>
                  {d.getDate()}
                </div>
              </div>
            ))}
          </div>

          <div>
            {HOURS.map((h) => (
              <div key={h} className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-gray-100">
                <div className="border-r border-gray-100 px-3 py-3 text-right text-[11px] text-gray-400">{h}:00</div>
                {days.map((d, i) => (
                  <div
                    key={i}
                    className={`min-h-14 border-l border-gray-100 ${isToday(d) ? 'bg-blue-50/30' : ''}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
