import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { DONE_CATEGORIES } from '../../lib/constants.js';
import { cn } from '../../lib/utils.js';

export default function DoneModal({ open, onClose, onDone, contactName }) {
  const [category, setCategory] = useState('replied');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setCategory('replied');
      setNote('');
    }
  }, [open]);

  const submit = () => {
    onDone?.({ category, note: note.trim() || null });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Markeer als afgehandeld"
      subtitle={contactName ? `Sluit dit bericht met ${contactName} af` : 'Kies categorie en voeg eventueel een notitie toe'}
      maxWidth="max-w-[440px]"
      footer={
        <button
          onClick={submit}
          className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
        >
          <i className="fa-solid fa-circle-check mr-1.5" />Markeer als afgehandeld
        </button>
      }
    >
      <div className="p-5">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">Categorie</div>
        <div className="mb-5 grid grid-cols-3 gap-2">
          {DONE_CATEGORIES.map((c) => {
            const active = category === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center text-xs transition-all',
                  active
                    ? 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
                )}
              >
                <i className={`fa-solid fa-${c.icon} text-lg leading-none`} />
                <span className="font-medium">{c.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">Notitie (optioneel)</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Bijv. 'offerte verstuurd, €5000'"
          rows={3}
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
          autoFocus
        />
      </div>
    </Modal>
  );
}
