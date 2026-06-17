import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';

// Kleine modal om van een bericht een to-do te maken. Het originele bericht blijft staan.
export default function CreateTodoModal({ open, onClose, defaultTitle, onSubmit, submitting }) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Prefill de titel telkens als de modal (opnieuw) opent.
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle || '');
      setDueDate('');
    }
  }, [open, defaultTitle]);

  const handleSubmit = () => {
    if (!title.trim() || submitting) return;
    onSubmit?.({ title: title.trim(), due_date: dueDate || null });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="To-do maken van bericht"
      subtitle="Het originele bericht blijft gewoon in je inbox staan"
      maxWidth="max-w-[460px]"
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
            disabled={!title.trim() || submitting}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Bezig…' : 'Maak to-do'}
          </button>
        </>
      }
    >
      <div className="space-y-4 px-5 py-4">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
            Titel
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            autoFocus
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10"
            placeholder="Wat moet er gebeuren?"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
            Deadline <span className="font-normal normal-case text-gray-400">(optioneel)</span>
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10"
          />
        </div>
      </div>
    </Modal>
  );
}
