import { useEffect, useMemo, useState } from 'react';
import Modal from '../modals/Modal.jsx';
import { useContacts, useUpdateContact } from '../../hooks/useContacts.js';
import { api } from '../../lib/api.js';
import { useToast } from '../../hooks/useToast.jsx';
import { useQueryClient } from '@tanstack/react-query';

export default function ContactEditModal({ open, onClose, contact, onSaved }) {
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', birthday: '', tags: '', notes: '' });
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeSearch, setMergeSearch] = useState('');
  const update = useUpdateContact();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: allContacts } = useContacts({ search: mergeSearch });

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
      setMergeTarget('');
      setMergeSearch('');
    }
  }, [open, contact]);

  const mergeOptions = useMemo(() => {
    if (!allContacts?.contacts) return [];
    return allContacts.contacts.filter((c) => c.id !== contact?.id).slice(0, 50);
  }, [allContacts, contact]);

  if (!contact) return null;

  const submit = async () => {
    try {
      await update.mutateAsync({ id: contact.id, ...form });
      toast.success('Contact opgeslagen');
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const doMerge = async () => {
    if (!mergeTarget || mergeTarget === contact.id) return;
    const other = mergeOptions.find((c) => c.id === mergeTarget);
    if (!confirm(`Berichten van "${other?.name}" verplaatsen naar "${contact.name}"? Dit kan niet ongedaan worden.`)) return;
    try {
      await api.post('/contacts/merge', { keep_id: contact.id, merge_id: mergeTarget });
      toast.success(`Samengevoegd met ${other?.name}`);
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['messages'] });
      onClose?.();
    } catch (e) {
      toast.error(e.message || 'Merge mislukt');
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

        <details className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-amber-800">⚠️ Geavanceerd: samenvoegen met ander contact</summary>
          <div className="mt-2 space-y-2">
            <p className="text-xs text-amber-700">
              Berichten van het geselecteerde contact worden verplaatst naar <strong>{contact.name}</strong>.
              Lege velden worden aangevuld vanuit het andere contact. Het andere contact wordt verwijderd.
            </p>
            <input
              type="text"
              value={mergeSearch}
              onChange={(e) => setMergeSearch(e.target.value)}
              placeholder="Zoek contact…"
              className={inputCls}
            />
            <select
              value={mergeTarget}
              onChange={(e) => setMergeTarget(e.target.value)}
              className={`${inputCls} bg-white`}
            >
              <option value="">— Kies een contact om mee samen te voegen —</option>
              {mergeOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.company ? `(${c.company})` : ''} {c.email ? `· ${c.email}` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={doMerge}
              disabled={!mergeTarget}
              className="w-full rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Samenvoegen
            </button>
          </div>
        </details>
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
