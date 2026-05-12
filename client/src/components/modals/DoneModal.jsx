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
      maxWidth="max-w-lg"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Annuleren
          </button>
          <button
            onClick={submit}
            className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            ✅ Markeer als afgehandeld
          </button>
        </>
      }
    >
      <div className="p-6">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Categorie</div>
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DONE_CATEGORIES.map((c) => {
            const active = category === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all',
                  active
                    ? 'border-green-500 bg-green-50 text-green-900'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
                )}
              >
                <span>{c.icon}</span>
                <span className="font-medium">{c.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Notitie (optioneel)</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Bijv. 'offerte verstuurd, €5000'"
          rows={3}
          className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          autoFocus
        />
      </div>
    </Modal>
  );
}
