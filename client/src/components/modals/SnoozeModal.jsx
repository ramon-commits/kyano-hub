import { useState } from 'react';
import Modal from './Modal.jsx';
import { SNOOZE_OPTIONS } from '../../lib/constants.js';
import { toDateInputValue, toISO, formatDateTime } from '../../lib/utils.js';

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
      subtitle={contactName ? `Verberg ${contactName} tijdelijk uit je inbox` : 'Kies wanneer dit bericht terugkomt'}
      maxWidth="max-w-[420px]"
    >
      <div className="divide-y divide-gray-100">
        {SNOOZE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => handleQuick(opt)}
            className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-gray-50"
          >
            <i className={`fa-solid fa-${opt.icon} text-xl leading-none`} />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">{opt.label}</div>
              <div className="text-xs text-gray-500">{opt.sublabel}</div>
            </div>
            <span className="text-gray-300">→</span>
          </button>
        ))}

        {onWaiting ? (
          <button
            onClick={onWaiting}
            className="flex w-full items-center gap-3 bg-amber-50/50 px-5 py-3 text-left transition-colors hover:bg-amber-50"
          >
            <i className="fa-solid fa-hourglass-half text-xl leading-none" />
            <div className="flex-1">
              <div className="text-sm font-medium text-amber-900">Tot ze reageren</div>
              <div className="text-xs text-amber-700">Status wordt &lsquo;Wacht op reactie&rsquo;</div>
            </div>
            <span className="text-amber-400">→</span>
          </button>
        ) : null}
      </div>

      <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
          <i className="fa-solid fa-thumbtack mr-1" />Kies datum & tijd
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            min={toDateInputValue(new Date())}
          />
          <input
            type="time"
            value={customTime}
            onChange={(e) => setCustomTime(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
          />
          <button
            onClick={handleCustom}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Snooze
          </button>
        </div>
      </div>
    </Modal>
  );
}
