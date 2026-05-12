import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { toDateInputValue } from '../../lib/utils.js';
import { cn } from '../../lib/utils.js';

const DURATIONS = [15, 30, 45, 60];

const CALENDARS = [
  { id: 'ramon@endlessminds.nl', label: 'ramon@endlessminds.nl' },
  { id: 'ramon@lifeaidbevco.eu', label: 'ramon@lifeaidbevco.eu' },
  { id: 'dach@lifeaidbevco.eu', label: 'dach@lifeaidbevco.eu' },
  { id: 'brugman.ramon@gmail.com', label: 'brugman.ramon@gmail.com' },
];

export default function ScheduleModal({ open, onClose, onSchedule, contactName }) {
  const tomorrow = new Date(Date.now() + 86400000);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toDateInputValue(tomorrow));
  const [time, setTime] = useState('14:00');
  const [duration, setDuration] = useState(30);
  const [calendar, setCalendar] = useState(CALENDARS[0].id);

  useEffect(() => {
    if (open) {
      setTitle(contactName ? `Meeting met ${contactName}` : 'Nieuwe afspraak');
      setDate(toDateInputValue(new Date(Date.now() + 86400000)));
      setTime('14:00');
      setDuration(30);
      setCalendar(CALENDARS[0].id);
    }
  }, [open, contactName]);

  const submit = () => {
    onSchedule?.({ title, date, time, duration, calendar });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Afspraak inplannen"
      subtitle="Toevoegen aan Google Calendar"
      maxWidth="max-w-lg"
      footer={
        <>
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100">
            Annuleren
          </button>
          <button onClick={submit} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700">
            📅 Toevoegen aan Calendar
          </button>
        </>
      }
    >
      <div className="space-y-4 p-6">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">Titel</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">Datum</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">Tijd</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">Duur</label>
          <div className="flex gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-all',
                  duration === d
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                )}
              >
                {d}min
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">Calendar</label>
          <select
            value={calendar}
            onChange={(e) => setCalendar(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {CALENDARS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
