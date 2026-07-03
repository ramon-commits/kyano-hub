import { useEffect, useRef, useState } from 'react';
import { useChannels } from '../../hooks/useChannels.js';
import { useToast } from '../../hooks/useToast.jsx';
import { api } from '../../lib/api.js';

function escapeToHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// Editor voor een template (opgeslagen als quick_reply). Rich text (bold/italic/link/lijst),
// bijlages en een voorkeur-afzenderaccount. Shortcut is optioneel.
export default function TemplateEditorModal({ template, onSave, onClose }) {
  const toast = useToast();
  const { data: channelsData } = useChannels();
  const allChannels = channelsData?.channels || [];
  const connectedChannels = allChannels.filter((c) => c.is_connected !== 0 && c.is_connected !== false);

  const [title, setTitle] = useState(template?.title || '');
  const [subject, setSubject] = useState(template?.subject || '');
  const [bodyText, setBodyText] = useState(template?.body || '');
  const [bodyHtml, setBodyHtml] = useState(template?.body_html || '');
  const [category, setCategory] = useState(template?.category || 'algemeen');
  const [shortcut, setShortcut] = useState(template?.shortcut || '');
  const [channelType, setChannelType] = useState(template?.channel_type || 'all');
  const [preferredChannelId, setPreferredChannelId] = useState(template?.preferred_channel_id || '');
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialiseer de contentEditable één keer (niet controlled — voorkomt cursor-sprongen).
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = template?.body_html || (template?.body ? escapeToHtml(template.body) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Laad bestaande bijlages bij bewerken.
  useEffect(() => {
    if (!template?.id) return;
    api.get(`/quick-replies/${template.id}/full`)
      .then((r) => setExistingAttachments(r.template?.attachments || []))
      .catch(() => { /* niet kritisch */ });
  }, [template?.id]);

  const syncFromEditor = () => {
    if (!editorRef.current) return;
    setBodyHtml(editorRef.current.innerHTML);
    setBodyText(editorRef.current.innerText);
  };

  const exec = (cmd) => {
    document.execCommand(cmd, false, null);
    editorRef.current?.focus();
    syncFromEditor();
  };

  const insertLink = () => {
    const selection = window.getSelection();
    const selected = selection ? selection.toString() : '';
    if (!selected) { toast.warning('Selecteer eerst tekst om een link van te maken'); return; }
    // eslint-disable-next-line no-alert
    const url = prompt('URL:', 'https://');
    if (!url) return;
    document.execCommand('createLink', false, url);
    syncFromEditor();
  };

  const deleteExistingAttachment = async (id) => {
    try {
      await api.delete(`/quick-replies/attachments/${id}`);
      setExistingAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };

  const canSave = title.trim() && bodyText.trim() && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const id = await onSave({
        title: title.trim(),
        subject: subject.trim() || null,
        body: bodyText.trim(),
        body_html: bodyHtml || null,
        category,
        channel_type: channelType === 'all' ? null : channelType,
        preferred_channel_id: preferredChannelId || null,
        shortcut: shortcut.trim() || null,
      });
      if (newFiles.length && id) {
        const fd = new FormData();
        for (const f of newFiles) fd.append('files', f);
        await api.postForm(`/quick-replies/${id}/attachments`, fd);
      }
      onClose();
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  const accountsForType = connectedChannels.filter((c) => channelType === 'all' || c.type === channelType);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-gray-100 p-5">
          <h3 className="text-lg font-semibold text-gray-900">{template ? 'Template bewerken' : 'Nieuwe template'}</h3>
          <p className="mt-1 text-xs text-gray-500">
            Gebruik <code className="rounded bg-gray-100 px-1">{'{naam}'}</code> en{' '}
            <code className="rounded bg-gray-100 px-1">{'{bedrijf}'}</code> als variabelen.
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5 scrollbar-thin">
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
            <div className="mt-1 flex items-center gap-1 rounded-t-lg border border-b-0 border-gray-200 bg-gray-50 px-2 py-1">
              <button type="button" onClick={() => exec('bold')} className="rounded p-1 hover:bg-gray-200" title="Vet"><i className="fa-solid fa-bold text-xs" /></button>
              <button type="button" onClick={() => exec('italic')} className="rounded p-1 hover:bg-gray-200" title="Cursief"><i className="fa-solid fa-italic text-xs" /></button>
              <button type="button" onClick={insertLink} className="rounded p-1 hover:bg-gray-200" title="Link van selectie"><i className="fa-solid fa-link text-xs" /></button>
              <button type="button" onClick={() => exec('insertUnorderedList')} className="rounded p-1 hover:bg-gray-200" title="Lijst"><i className="fa-solid fa-list-ul text-xs" /></button>
            </div>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={syncFromEditor}
              className="min-h-[160px] w-full whitespace-pre-wrap rounded-b-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-blue-500 [&_a]:text-blue-600 [&_a]:underline"
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-gray-600">Bijlages</label>
            {existingAttachments.map((att) => (
              <div key={att.id} className="mt-1 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <i className="fa-solid fa-file text-gray-400" />
                <span className="flex-1 truncate">{att.filename}</span>
                <span className="text-xs text-gray-400">{Math.max(1, Math.round((att.file_size || 0) / 1024))} KB</span>
                <button onClick={() => deleteExistingAttachment(att.id)} className="text-red-500 hover:text-red-700" aria-label="Verwijderen">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            ))}
            {newFiles.map((f, i) => (
              <div key={`${f.name}-${i}`} className="mt-1 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm">
                <i className="fa-solid fa-file-arrow-up text-blue-400" />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-xs text-blue-500">nieuw · {Math.max(1, Math.round(f.size / 1024))} KB</span>
                <button onClick={() => setNewFiles((prev) => prev.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700" aria-label="Verwijderen">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              <i className="fa-solid fa-paperclip" /> Bijlage toevoegen
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { setNewFiles((prev) => [...prev, ...Array.from(e.target.files)]); e.target.value = ''; }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-gray-600">Categorie</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500">
                <option value="algemeen">Algemeen</option>
                <option value="sales">Sales</option>
                <option value="support">Support</option>
                <option value="follow-up">Follow-up</option>
                <option value="afscheid">Afscheid</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-gray-600">Kanaal type</label>
              <select
                value={channelType}
                onChange={(e) => { setChannelType(e.target.value); setPreferredChannelId(''); }}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="all">Alle kanalen</option>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-gray-600">Voorkeur-account</label>
            <select
              value={preferredChannelId}
              onChange={(e) => setPreferredChannelId(e.target.value)}
              disabled={channelType === 'all'}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">Willekeurig</option>
              {accountsForType.map((c) => (
                <option key={c.id} value={c.id}>{c.account_email || c.label}</option>
              ))}
            </select>
            {channelType === 'all' ? (
              <p className="mt-1 text-[11px] text-gray-400">Kies eerst een kanaaltype om een specifiek account te kiezen.</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 p-5">
          <button onClick={onClose} className="text-sm text-gray-500 transition-colors hover:text-gray-700">Annuleren</button>
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
