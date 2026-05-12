import { useEffect, useState } from 'react';
import Modal from '../modals/Modal.jsx';
import { useUpdateContact } from '../../hooks/useContacts.js';

export default function ContactEditModal({ open, onClose, contact, onSaved }) {
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', birthday: '', tags: '', notes: '' });
  const update = useUpdateContact();

  useEffect(() => {
    if (open && contact) {
      setForm({
        name: contact.name || '',
        company: contact.company || '',
        email: contact.email || '',
        phone: contact.phone || '',
        birthday: contact.birthday || '',
        tags: contact.tags || '',
        notes: contact.notes || '',
      });
    }
  }, [open, contact]);

  if (!contact) return null;

  const submit = async () => {
    try {
      await update.mutateAsync({ id: contact.id, ...form });
      onSaved?.();
      onClose?.();
    } catch (e) {
      // Toast handled bovenliggend
      console.error(e);
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Contact bewerken"
      subtitle={contact.name}
      maxWidth="max-w-lg"
      footer={
        <>
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100">
            Annuleren
          </button>
          <button
            onClick={submit}
            disabled={update.isPending}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {update.isPending ? 'Opslaan…' : 'Opslaan'}
          </button>
        </>
      }
    >
      <div className="space-y-3 p-6">
        <Field label="Naam">
          <input type="text" value={form.name} onChange={set('name')} className={inputCls} />
        </Field>
        <Field label="Bedrijf">
          <input type="text" value={form.company} onChange={set('company')} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input type="email" value={form.email} onChange={set('email')} className={inputCls} />
          </Field>
          <Field label="Telefoon">
            <input type="tel" value={form.phone} onChange={set('phone')} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Verjaardag">
            <input type="date" value={form.birthday} onChange={set('birthday')} className={inputCls} />
          </Field>
          <Field label="Tags (comma-separated)">
            <input type="text" value={form.tags} onChange={set('tags')} className={inputCls} placeholder="klant, vip" />
          </Field>
        </div>
        <Field label="Notities">
          <textarea value={form.notes} onChange={set('notes')} rows={3} className={`${inputCls} resize-none`} />
        </Field>
      </div>
    </Modal>
  );
}

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">{label}</span>
      {children}
    </label>
  );
}
