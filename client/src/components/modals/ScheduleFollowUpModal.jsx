import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';

const DAY_PRESETS = [
  { days: 1, label: '1 dag' },
  { days: 3, label: '3 dagen' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weken' },
];

// Plan een automatische follow-up: snooze tot X dagen en stel — als er geen reactie komt —
// een follow-up klaar (AI of vooraf geschreven).
export default function ScheduleFollowUpModal({ open, onClose, onSubmit, submitting }) {
  const [days, setDays] = useState(3);
  const [mode, setMode] = useState('ai');
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    if (open) {
      setDays(3);
      setMode('ai');
      setCustomText('');
    }
  }, [open]);

  const canSubmit = days > 0 && (mode === 'ai' || customText.trim()) && !submitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit?.({ days, mode, custom_text: mode === 'custom' ? customText.trim() : null });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Follow-up plannen"
      subtitle="Stuur automatisch een reminder als ze niet reageren"
      maxWidth="max-w-[480px]"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Annuleren
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Bezig…' : 'Plan follow-up'}
          </button>
        </>
      }
    >
      <div className="space-y-5 px-5 py-4">
        <div>
          <div className="mb-2 text-sm font-medium text-gray-900">
            Wanneer wil je een follow-up sturen als ze niet reageren?
          </div>
          <div className="flex flex-wrap gap-2">
            {DAY_PRESETS.map((opt) => (
              <button
                key={opt.days}
                onClick={() => setDays(opt.days)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  days === opt.days
                    ? 'border-purple-300 bg-purple-50 text-purple-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-gray-900">Wat wil je dat de follow-up zegt?</div>
          <div className="space-y-2">
            <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
              mode === 'ai' ? 'border-purple-300 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'
            }`}>
              <input
                type="radio"
                name="follow-up-mode"
                checked={mode === 'ai'}
                onChange={() => setMode('ai')}
                className="mt-0.5 accent-purple-600"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">🤖 AI genereert op basis van de thread</div>
                <div className="text-xs text-gray-500">De follow-up wordt op het moment van versturen geschreven</div>
              </div>
            </label>
            <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
              mode === 'custom' ? 'border-purple-300 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'
            }`}>
              <input
                type="radio"
                name="follow-up-mode"
                checked={mode === 'custom'}
                onChange={() => setMode('custom')}
                className="mt-0.5 accent-purple-600"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">✏️ Ik schrijf hem nu vast</div>
                <div className="text-xs text-gray-500">Jouw tekst staat straks klaar om te versturen</div>
              </div>
            </label>
          </div>

          {mode === 'custom' ? (
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Schrijf hier je follow-up bericht…"
              className="mt-3 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10"
            />
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
