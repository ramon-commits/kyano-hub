import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../../lib/api.js';
import { useToast } from '../../hooks/useToast.jsx';

export default function ForwardModal({ open, onClose, message }) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [extraText, setExtraText] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const debounceRef = useRef(null);
  const fileInputRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setTo('');
    setCc('');
    setBcc('');
    setShowCcBcc(false);
    setExtraText('');
    setFiles([]);
    setSuggestions([]);
    setSuggestionsOpen(false);
  }, [open]);

  // Autocomplete op contacten — debounce 200ms, alleen contacten met een email
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = to.trim();
    if (q.length < 2 || q.includes('@')) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.get(`/contacts?search=${encodeURIComponent(q)}`);
        const list = (r.contacts || [])
          .filter((c) => c.email)
          .slice(0, 8);
        setSuggestions(list);
        setSuggestionsOpen(list.length > 0);
      } catch { /* silent */ }
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [to, open]);

  const senderLine = useMemo(() => {
    if (!message) return '';
    return message.contact_name && message.contact_email
      ? `${message.contact_name} <${message.contact_email}>`
      : (message.contact_email || message.contact_name || 'onbekend');
  }, [message]);

  const previewSnippet = useMemo(() => {
    if (!message) return '';
    const s = message.body_text || message.snippet || '';
    return s.length > 400 ? s.slice(0, 400) + '…' : s;
  }, [message]);

  async function submit() {
    if (!to.trim()) {
      toast.error('Vul minimaal één ontvanger in');
      return;
    }
    if (!message?.id) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('to', to.trim());
      if (cc.trim()) formData.append('cc', cc.trim());
      if (bcc.trim()) formData.append('bcc', bcc.trim());
      if (extraText) formData.append('extra_text', extraText);
      for (const f of files) formData.append('files', f, f.name);
      const r = await api.postForm(`/messages/${message.id}/forward`, formData);
      const attLabel = r.attachments ? ` + ${r.attachments} bijlage${r.attachments === 1 ? '' : 'n'}` : '';
      toast.success(`Doorgestuurd naar ${r.to}${attLabel}`, 'Verstuurd');
      onClose?.();
    } catch (e) {
      if (e.status === 400) toast.error(e.message);
      else if (e.status === 401) toast.error('Account moet opnieuw verbonden worden', 'Herconnectie nodig');
      else toast.error(e.message || 'Doorsturen mislukt');
    } finally {
      setSending(false);
    }
  }

  function pickSuggestion(c) {
    setTo(c.email);
    setSuggestions([]);
    setSuggestionsOpen(false);
  }

  if (!message) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Email doorsturen"
      subtitle={message.subject || '(geen onderwerp)'}
      maxWidth="max-w-[560px]"
      footer={
        <>
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100">
            Annuleren
          </button>
          <button
            onClick={submit}
            disabled={sending || !to.trim()}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? 'Versturen…' : (<><i className="fa-solid fa-share mr-1.5" />Doorsturen</>)}
          </button>
        </>
      }
    >
      <div className="space-y-4 p-6">
        <div className="relative">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">Aan</label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onFocus={() => suggestions.length && setSuggestionsOpen(true)}
            onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
            placeholder="naam of email@adres.nl"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          {suggestionsOpen && suggestions.length > 0 ? (
            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
              {suggestions.map((c) => (
                <li
                  key={c.id}
                  onMouseDown={(e) => { e.preventDefault(); pickSuggestion(c); }}
                  className="cursor-pointer px-3 py-2 text-sm hover:bg-blue-50"
                >
                  <div className="font-medium text-gray-900">{c.name}</div>
                  <div className="text-xs text-gray-500">{c.email}</div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {showCcBcc ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">CC</label>
              <input
                type="text"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="optioneel"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">BCC</label>
              <input
                type="text"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="optioneel"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCcBcc(true)}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            + CC / BCC toevoegen
          </button>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">Bericht (optioneel)</label>
          <textarea
            value={extraText}
            onChange={(e) => setExtraText(e.target.value)}
            rows={3}
            placeholder="Voeg een korte toelichting toe…"
            className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            <i className="fa-solid fa-paperclip" /> Bijlage toevoegen
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              setFiles((prev) => [...prev, ...Array.from(e.target.files)]);
              e.target.value = '';
            }}
          />
          {files.length > 0 ? (
            <div className="mt-2 space-y-1">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm">
                  <i className="fa-solid fa-file text-gray-400" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500"
                    aria-label="Bijlage verwijderen"
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-500">Origineel</div>
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            <div className="mb-2 text-[11px] text-gray-500">
              <div><strong>Van:</strong> {senderLine}</div>
              <div><strong>Datum:</strong> {message.received_at}</div>
              <div><strong>Onderwerp:</strong> {message.subject || '(geen onderwerp)'}</div>
            </div>
            <div className="whitespace-pre-wrap border-l-2 border-gray-300 pl-3 text-gray-600">
              {previewSnippet || '(leeg)'}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
