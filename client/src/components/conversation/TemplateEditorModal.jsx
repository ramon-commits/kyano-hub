import { useState } from 'react';

// Editor voor een template (opgeslagen als quick_reply). Shortcut is optioneel —
// de backend leidt er anders zelf een af uit de naam.
export default function TemplateEditorModal({ template, channelType, onSave, onClose }) {
  const [title, setTitle] = useState(template?.title || '');
  const [subject, setSubject] = useState(template?.subject || '');
  const [body, setBody] = useState(template?.body || '');
  const [category, setCategory] = useState(template?.category || 'algemeen');
  const [shortcut, setShortcut] = useState(template?.shortcut || '');
  const [channel, setChannel] = useState(template?.channel_type || 'all');
  const [saving, setSaving] = useState(false);

  const canSave = title.trim() && body.trim() && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        subject: subject.trim() || null,
        body: body.trim(),
        category,
        channel_type: channel === 'all' ? null : channel,
        shortcut: shortcut.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-gray-100 p-5">
          <h3 className="text-lg font-semibold text-gray-900">{template ? 'Template bewerken' : 'Nieuwe template'}</h3>
          <p className="mt-1 text-xs text-gray-500">
            Gebruik <code className="rounded bg-gray-100 px-1">{'{naam}'}</code> en{' '}
            <code className="rounded bg-gray-100 px-1">{'{bedrijf}'}</code> als variabelen.
          </p>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-gray-600">Naam</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="bijv. Bedankt bericht"
              autoFocus
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-gray-600">Sneltoets (optioneel)</label>
            <input
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              placeholder="/bedankt — leeg = automatisch"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-gray-600">Onderwerp (alleen email)</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Onderwerp"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-gray-600">Bericht</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'Hoi {naam},\n\nBedankt voor je bericht…'}
              rows={7}
              className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium uppercase tracking-wider text-gray-600">Categorie</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="algemeen">Algemeen</option>
                <option value="sales">Sales</option>
                <option value="support">Support</option>
                <option value="follow-up">Follow-up</option>
                <option value="afscheid">Afscheid</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium uppercase tracking-wider text-gray-600">Voor kanaal</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="all">Alle kanalen</option>
                <option value="email">Alleen email</option>
                <option value="whatsapp">Alleen WhatsApp</option>
                <option value="linkedin">Alleen LinkedIn</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 p-5">
          <button onClick={onClose} className="text-sm text-gray-500 transition-colors hover:text-gray-700">
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Bezig…' : template ? 'Opslaan' : 'Aanmaken'}
          </button>
        </div>
      </div>
    </div>
  );
}
