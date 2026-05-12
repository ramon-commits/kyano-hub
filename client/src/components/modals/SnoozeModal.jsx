import { useState } from 'react';
import Modal from './Modal.jsx';
import { SNOOZE_OPTIONS } from '../../lib/constants.js';
import { toDateInputValue, toTimeInputValue, toISO, formatDateTime } from '../../lib/utils.js';

export default function SnoozeModal({ open, onClose, onSnooze, onWaiting, contactName }) {
  const [customDate, setCustomDate] = useState(toDateInputValue(new Date(Date.now() + 86400000)));
  const [customTime, setCustomTime] = useState('09:00');

  const handleQuick = (opt) => {
    const date = opt.getDate();
    onSnooze?.(toISO(date), formatDateTime(date));
  };

  const handleCustom = () => {
    if (!customDate || !customTime) return;
    const date = new Date(`${customDate}T${customTime}`);
    if (isNaN(date.getTime())) return;
    onSnooze?.(toISO(date), formatDateTime(date));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Snooze bericht"
      subtitle={contactName ? `Stop ${contactName} tijdelijk uit je inbox` : 'Kies wanneer dit bericht terugkomt'}
      maxWidth="max-w-lg"
    >
      <div className="p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SNOOZE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => handleQuick(opt)}
              className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-all hover:border-blue-300 hover:bg-blue-50"
            >
              <span className="text-xl">{opt.icon}</span>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{opt.label}</div>
                <div className="text-xs text-gray-500">{opt.sublabel}</div>
              </div>
            </button>
          ))}

          {onWaiting ? (
            <button
              onClick={onWaiting}
              className="col-span-1 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left transition-all hover:bg-amber-100 sm:col-span-2"
            >
              <span className="text-xl">⏳</span>
              <div className="flex-1">
                <div className="text-sm font-medium text-amber-900">Tot ze reageren</div>
                <div className="text-xs text-amber-700">Status wordt &lsquo;Wacht op reactie&rsquo;</div>
              </div>
            </button>
          ) : null}
        </div>

        <div className="mt-6 border-t border-gray-100 pt-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-500">
            <span>📌</span>Kies datum & tijd
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              min={toDateInputValue(new Date())}
            />
            <input
              type="time"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleCustom}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Snooze
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
