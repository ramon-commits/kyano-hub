import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { toDateInputValue, cn } from '../../lib/utils.js';
import { useCreateEvent } from '../../hooks/useCalendar.js';
import { useChannels } from '../../hooks/useChannels.js';
import { useToast } from '../../hooks/useToast.jsx';

const DURATIONS = [15, 30, 45, 60];

export default function ScheduleModal({ open, onClose, contactName, contactEmail }) {
  const tomorrow = new Date(Date.now() + 86400000);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toDateInputValue(tomorrow));
  const [time, setTime] = useState('14:00');
  const [duration, setDuration] = useState(30);
  const [channel, setChannel] = useState('');
  const [attendee, setAttendee] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const { data: channelsData } = useChannels();
  const createEvent = useCreateEvent();
  const toast = useToast();

  const emailChannels = (channelsData?.channels || []).filter((c) => c.type === 'email' && c.is_connected);

  // Reset alleen bij het openen van de modal (open false → true), niet bij elke re-render.
  // Bug: emailChannels is een nieuwe array-ref elke render → effect liep telkens → titel werd gereset.
  useEffect(() => {
    if (!open) return;
    setTitle(contactName ? `Meeting met ${contactName}` : 'Nieuwe afspraak');
    setDate(toDateInputValue(new Date(Date.now() + 86400000)));
    setTime('14:00');
    setDuration(30);
    setAttendee(contactEmail || '');
    setLocation('');
    setDescription('');
  }, [open, contactName, contactEmail]);

  // Default Calendar account zodra de lijst geladen is — apart effect, raakt overige velden niet.
  useEffect(() => {
    if (open && emailChannels.length > 0 && !channel) {
      setChannel(emailChannels[0].id);
    }
  }, [open, emailChannels, channel]);

  const submit = async () => {
    if (!channel) {
      toast.error('Kies een Calendar account');
      return;
    }
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + duration * 60000);
    const attendee_emails = attendee
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.includes('@'));
    try {
      await createEvent.mutateAsync({
        channel_id: channel,
        title,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        duration_minutes: duration,
        attendee_emails,
        description: description || null,
        location: location || null,
      });
      const invitedNote = attendee_emails.length
        ? ` · ${attendee_emails.length} uitnodiging${attendee_emails.length === 1 ? '' : 'en'} verstuurd`
        : '';
      toast.success(`Afspraak toegevoegd op ${date} ${time}${invitedNote}`, 'Gepland');
      onClose?.();
    } catch (e) {
      toast.error(e.message || 'Calendar create faalde');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Afspraak inplannen"
      subtitle="Toevoegen aan Google Calendar"
      maxWidth="max-w-[440px]"
      footer={
        <>
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100">
            Annuleren
          </button>
          <button
            onClick={submit}
            disabled={createEvent.isPending || !channel}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {createEvent.isPending ? 'Toevoegen…' : (<><i className="fa-solid fa-calendar-days mr-1.5" />Toevoegen aan Calendar</>)}
          </button>
        </>
      }
    >
      <div className="space-y-4 p-6">
        {emailChannels.length === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <i className="fa-solid fa-triangle-exclamation mr-1.5" />Geen verbonden Calendar accounts. Verbind eerst een Gmail account in Instellingen.
          </div>
        ) : null}

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
                  duration === d ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                )}
              >
                {d}min
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">Calendar account</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">— Kies account —</option>
            {emailChannels.map((c) => (
              <option key={c.id} value={c.id}>{c.account_email}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">
            Uitnodigen (email, komma-gescheiden)
          </label>
          <input
            type="text"
            value={attendee}
            onChange={(e) => setAttendee(e.target.value)}
            placeholder="naam@bedrijf.com, naam2@bedrijf.com"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-[11px] text-gray-500">
            Google Calendar stuurt automatisch een email-uitnodiging naar elke ontvanger.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">Locatie</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="optioneel"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">Beschrijving</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="optioneel"
            className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
    </Modal>
  );
}
