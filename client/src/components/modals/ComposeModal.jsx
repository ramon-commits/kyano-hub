import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Modal from './Modal.jsx';
import ContactAutocomplete from '../shared/ContactAutocomplete.jsx';
import Avatar from '../shared/Avatar.jsx';
import { useChannels } from '../../hooks/useChannels.js';
import { useToast } from '../../hooks/useToast.jsx';
import { api } from '../../lib/api.js';

const CHANNEL_META = {
  email: { icon: 'fa-solid fa-envelope', label: 'Email', accent: 'border-blue-500 bg-blue-50 text-blue-700' },
  whatsapp: { icon: 'fa-brands fa-whatsapp', label: 'WhatsApp', accent: 'border-green-500 bg-green-50 text-green-700' },
  linkedin: { icon: 'fa-brands fa-linkedin', label: 'LinkedIn', accent: 'border-sky-600 bg-sky-50 text-sky-700' },
  instagram: { icon: 'fa-brands fa-instagram', label: 'Instagram', accent: 'border-pink-500 bg-pink-50 text-pink-700' },
};

const ALL_CHANNEL_TYPES = ['email', 'whatsapp', 'linkedin', 'instagram'];

export default function ComposeModal({
  open,
  onClose,
  initialChannel = null,
  initialContact = null,
  prefillSubject = '',
  prefillText = '',
  prefillTodoTitle = '',
  prefillTodoDesc = '',
  sourceMessageId = null,
  linkedAsanaId = null,
}) {
  const { data: channelsData } = useChannels();
  const toast = useToast();
  const qc = useQueryClient();

  const [mode, setMode] = useState('message'); // 'message' | 'todo'
  const [contact, setContact] = useState(null);
  const [channelType, setChannelType] = useState(null);
  const [accountId, setAccountId] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(null);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const textareaRef = useRef(null);
  const langWrapRef = useRef(null);
  const todoTitleRef = useRef(null);
  const fileInputRef = useRef(null);

  // To-do velden
  const [todoTitle, setTodoTitle] = useState('');
  const [todoDesc, setTodoDesc] = useState('');
  const [todoDate, setTodoDate] = useState('');
  const [todoTime, setTodoTime] = useState('');
  const [todoPriority, setTodoPriority] = useState('medium');

  const allChannels = channelsData?.channels || [];
  const connectedChannels = allChannels.filter((c) => c.is_connected !== 0 && c.is_connected !== false);

  // Reset bij openen
  useEffect(() => {
    if (!open) return;
    const isTodo = initialChannel === 'todo';
    // Bericht-modus kan met een vooraf gekozen kanaal + contact geopend worden (bv. vanuit een Asana-taak).
    const presetChannel = !isTodo && ALL_CHANNEL_TYPES.includes(initialChannel) ? initialChannel : null;
    setMode(isTodo ? 'todo' : 'message');
    setContact(initialContact || null);
    setChannelType(presetChannel);
    setAccountId('');
    setTo('');
    setCc('');
    setBcc('');
    setShowCcBcc(false);
    setSubject(prefillSubject || '');
    setText(prefillText || '');
    setFiles([]);
    setSending(false);
    setAiLoading(null);
    setShowLangPicker(false);
    setTodoTitle(prefillTodoTitle || '');
    setTodoDesc(prefillTodoDesc || '');
    setTodoDate('');
    setTodoTime('');
    setTodoPriority('medium');
  }, [open, initialChannel, initialContact, prefillSubject, prefillText, prefillTodoTitle, prefillTodoDesc]);

  // Focus de titel zodra de to-do modus actief is (snelle 't' flow)
  useEffect(() => {
    if (open && mode === 'todo') {
      requestAnimationFrame(() => todoTitleRef.current?.focus());
    }
  }, [open, mode]);

  // Asana "Neem contact op"-flow: zodra kanaal + contact + bericht-veld zichtbaar zijn,
  // focus direct de textarea zodat Ramon meteen kan typen.
  useEffect(() => {
    if (open && linkedAsanaId && mode === 'message' && contact && channelType) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [open, linkedAsanaId, mode, contact, channelType]);

  useEffect(() => {
    if (!showLangPicker) return undefined;
    function onDown(e) {
      if (langWrapRef.current && !langWrapRef.current.contains(e.target)) setShowLangPicker(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showLangPicker]);

  // Wanneer contact gekozen wordt, beschikbare kanalen bepalen
  const availableChannelTypes = useMemo(() => {
    if (!contact) return ALL_CHANNEL_TYPES.filter((t) => connectedChannels.some((c) => c.type === t));
    const fromContact = contact.available_channels || [];
    const expanded = new Set(fromContact);
    if (contact.email) expanded.add('email');
    if (contact.phone) expanded.add('whatsapp');
    return ALL_CHANNEL_TYPES.filter((t) => expanded.has(t) && connectedChannels.some((c) => c.type === t));
  }, [contact, connectedChannels]);

  // Accounts voor het gekozen kanaal-type
  const accountsForChannel = useMemo(() => {
    if (!channelType) return [];
    return connectedChannels.filter((c) => c.type === channelType);
  }, [channelType, connectedChannels]);

  // Default account zodra kanaal gekozen wordt
  useEffect(() => {
    if (channelType && accountsForChannel.length > 0 && !accountId) {
      setAccountId(accountsForChannel[0].id);
    }
  }, [channelType, accountsForChannel, accountId]);

  // Pre-fill velden zodra kanaal/contact bekend zijn
  useEffect(() => {
    if (!contact || !channelType) return;
    if (channelType === 'email') {
      setTo(contact.email || '');
    } else if (channelType === 'whatsapp') {
      setTo(contact.phone || contact.name || '');
    } else {
      setTo(contact.name || '');
    }
  }, [contact, channelType]);

  // Reset accountId zodra kanaal wijzigt
  useEffect(() => { setAccountId(''); }, [channelType]);

  const onContactSelect = (c) => {
    setContact(c);
    const available = c?.available_channels || [];
    const candidates = available.filter((t) => connectedChannels.some((ch) => ch.type === t));
    if (candidates.length === 1) setChannelType(candidates[0]);
    else setChannelType(null);
  };

  const isChat = channelType && channelType !== 'email';
  const isEmail = channelType === 'email';
  const channelMeta = channelType ? CHANNEL_META[channelType] : null;
  const recipientLabel = contact?.name || contact?.email || contact?.phone || to;

  const setTextWithFocus = (next) => {
    setText(next);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(next.length, next.length);
      }
    });
  };

  const handleImproveNL = async () => {
    if (!text.trim()) { toast.warning('Type eerst een bericht'); return; }
    setAiLoading('improve');
    try {
      const r = await api.post('/ai/improve-nl', { text });
      if (r?.result) { setTextWithFocus(r.result); toast.success('Tekst verbeterd'); }
    } catch (e) {
      toast.error(e.message || 'Verbeteren mislukt');
    } finally { setAiLoading(null); }
  };

  const handleTranslate = async (lang) => {
    if (!text.trim()) { toast.warning('Type eerst een bericht'); return; }
    setShowLangPicker(false);
    setAiLoading('translate');
    try {
      const r = await api.post('/ai/translate', { text, lang });
      if (r?.result) { setTextWithFocus(r.result); toast.success(`Vertaald naar ${lang.toUpperCase()}`); }
    } catch (e) {
      toast.error(e.message || 'Vertalen mislukt');
    } finally { setAiLoading(null); }
  };

  // Na een succesvolle verzending: vink de gekoppelde Asana-taak af (indien aanwezig).
  // Retourneert true als er een Asana-taak was gekoppeld (bepaalt de toast-tekst).
  const completeLinkedAsana = async () => {
    if (!linkedAsanaId) return false;
    try {
      await api.post(`/asana/complete/${linkedAsanaId}`);
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      return true;
    } catch {
      toast.warning('Bericht verstuurd, maar Asana-taak afvinken mislukte');
      return false;
    }
  };

  const submit = async () => {
    if (!channelType) { toast.warning('Kies een kanaal'); return; }
    if (!accountId) { toast.warning('Kies een account'); return; }
    if (!text.trim()) { toast.warning('Schrijf een bericht'); return; }
    if (isEmail && !to.trim()) { toast.warning('Vul een ontvanger in'); return; }
    if (isEmail && !subject.trim()) { toast.warning('Vul een onderwerp in'); return; }
    if (isChat && !contact?.id && !to.trim()) { toast.warning('Vul een nummer of contact in'); return; }

    setSending(true);
    try {
      if (isEmail) {
        const fd = new FormData();
        fd.append('channel_id', accountId);
        fd.append('to', to.trim());
        if (cc.trim()) fd.append('cc', cc.trim());
        if (bcc.trim()) fd.append('bcc', bcc.trim());
        fd.append('subject', subject.trim());
        fd.append('body_text', text);
        for (const f of files) fd.append('files', f, f.name);
        await api.postForm('/messages/compose', fd);
        const asanaDone = await completeLinkedAsana();
        toast.success(asanaDone ? 'Verstuurd + Asana taak afgevinkt' : `Email verstuurd naar ${recipientLabel}`, 'Verzonden');
        onClose?.();
        return;
      }

      const phoneOverride = contact?.phone ? null : to.trim() || null;
      const r = await api.post('/messages/compose-chat', {
        channel_id: accountId,
        contact_id: contact?.id || null,
        phone: phoneOverride,
        recipient_name: contact?.name || null,
        text,
      });
      if (r?.ok) {
        const asanaDone = await completeLinkedAsana();
        toast.success(asanaDone ? 'Verstuurd + Asana taak afgevinkt' : `Bericht verstuurd naar ${recipientLabel}`, 'Verzonden');
        onClose?.();
      } else if (r?.fallback && r?.deep_link) {
        toast.info('Geen Unipile-verbinding mogelijk. Opent WhatsApp Web…', 'Fallback');
        window.open(r.deep_link, '_blank', 'noopener');
        onClose?.();
      } else {
        toast.error(r?.error || 'Versturen mislukt');
      }
    } catch (e) {
      toast.error(e.message || 'Versturen mislukt');
    } finally {
      setSending(false);
    }
  };

  const submitTodo = async () => {
    if (!todoTitle.trim()) { toast.warning('Vul een titel in'); todoTitleRef.current?.focus(); return; }

    let due_date = null;
    if (todoDate) {
      const d = new Date(`${todoDate}T${todoTime || '09:00'}`);
      if (!isNaN(d.getTime())) due_date = d.toISOString();
    }

    setSending(true);
    try {
      await api.post('/messages/todo', {
        title: todoTitle.trim(),
        description: todoDesc.trim() || null,
        due_date,
        priority: todoPriority,
        source_message_id: sourceMessageId || null,
      });
      toast.success('To-do toegevoegd');
      onClose?.();
    } catch (e) {
      toast.error(e.message || 'Toevoegen mislukt');
    } finally {
      setSending(false);
    }
  };

  const isTodoMode = mode === 'todo';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isTodoMode ? 'Nieuwe to-do' : 'Nieuw bericht'}
      subtitle={isTodoMode ? 'Voeg een taak toe aan je inbox' : 'Start een nieuw gesprek via email, WhatsApp of LinkedIn'}
      maxWidth="max-w-2xl"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Annuleren
          </button>
          {isTodoMode ? (
            <button
              onClick={submitTodo}
              disabled={sending || !todoTitle.trim()}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Toevoegen…
                </span>
              ) : (
                <><i className="fa-solid fa-plus mr-1.5" />Toevoegen</>
              )}
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={sending || !channelType || !accountId || !text.trim()}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Versturen…
                </span>
              ) : (
                <><i className="fa-solid fa-paper-plane mr-1.5" />Verstuur{channelMeta ? ` via ${channelMeta.label}` : ''}</>
              )}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-5 p-5">
        {/* Modus: Bericht of To-do */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            onClick={() => setMode('message')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              !isTodoMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <i className="fa-solid fa-paper-plane" />Bericht
          </button>
          <button
            onClick={() => setMode('todo')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isTodoMode ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <i className="fa-solid fa-list-check" />To-do
          </button>
        </div>

        {isTodoMode ? (
          <section className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Titel</label>
              <input
                ref={todoTitleRef}
                type="text"
                value={todoTitle}
                onChange={(e) => setTodoTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); submitTodo(); }
                }}
                placeholder="Wat moet er gebeuren?"
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Beschrijving</label>
              <textarea
                value={todoDesc}
                onChange={(e) => setTodoDesc(e.target.value)}
                rows={3}
                placeholder="Optionele details…"
                className="w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Deadline (optioneel)</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={todoDate}
                  onChange={(e) => setTodoDate(e.target.value)}
                  className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10"
                />
                <input
                  type="time"
                  value={todoTime}
                  onChange={(e) => setTodoTime(e.target.value)}
                  className="w-32 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10"
                />
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                <i className="fa-solid fa-info-circle mr-1" />Met een deadline wordt de to-do gesnoozed tot die datum.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Prioriteit</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTodoPriority('medium')}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    todoPriority === 'medium' ? 'border-gray-400 bg-gray-100 text-gray-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Normaal
                </button>
                <button
                  onClick={() => setTodoPriority('high')}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    todoPriority === 'high' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <i className="fa-solid fa-circle-exclamation" />Urgent
                </button>
              </div>
            </div>
          </section>
        ) : (
        <>
        {/* STAP 1 — Contact */}
        <section>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Aan
          </label>
          {contact ? (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
              <Avatar name={contact.name} initials={contact.avatar_initials} color={contact.avatar_color} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-gray-900">{contact.name || contact.email || contact.phone}</div>
                <div className="truncate text-xs text-gray-500">
                  {[contact.email, contact.phone].filter(Boolean).join(' · ') || (contact.manual ? 'Handmatig ingevoerd' : '')}
                </div>
              </div>
              <button
                onClick={() => { setContact(null); setChannelType(null); setTo(''); }}
                className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-800"
                title="Andere ontvanger kiezen"
              >
                <i className="fa-solid fa-xmark mr-1" />Wissel
              </button>
            </div>
          ) : (
            <ContactAutocomplete
              onSelect={onContactSelect}
              placeholder="Zoek contact, of typ een emailadres / telefoonnummer…"
              autoFocus
            />
          )}
        </section>

        {/* STAP 2 — Kanaal */}
        {contact ? (
          <section>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Kanaal
            </label>
            {availableChannelTypes.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <i className="fa-solid fa-triangle-exclamation mr-1.5" />Geen verbonden kanalen beschikbaar voor dit contact.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableChannelTypes.map((t) => {
                  const meta = CHANNEL_META[t];
                  const active = channelType === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setChannelType(t)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? meta.accent
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <i className={meta.icon} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {/* STAP 3 — Account + bericht */}
        {contact && channelType ? (
          <section className="space-y-3 rounded-lg border border-gray-100 bg-gray-50/60 p-4">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Van</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
              >
                {accountsForChannel.length === 0 ? <option value="">— Geen account —</option> : null}
                {accountsForChannel.map((c) => (
                  <option key={c.id} value={c.id}>{c.account_email || c.label}</option>
                ))}
              </select>
            </div>

            {isEmail ? (
              <>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Aan</label>
                  <input
                    type="text"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="naam@bedrijf.com"
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowCcBcc((v) => !v)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    {showCcBcc ? 'CC/BCC verbergen' : 'CC/BCC tonen'}
                  </button>
                </div>
                {showCcBcc ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={cc}
                      onChange={(e) => setCc(e.target.value)}
                      placeholder="CC"
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                    />
                    <input
                      type="text"
                      value={bcc}
                      onChange={(e) => setBcc(e.target.value)}
                      placeholder="BCC"
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                    />
                  </div>
                ) : null}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Onderwerp</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Korte titel"
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Aan</label>
                <input
                  type="text"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder={channelType === 'whatsapp' ? '+31 6 12345678' : 'Naam'}
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                />
                {channelType === 'whatsapp' && !contact?.phone ? (
                  <p className="mt-1 text-[11px] text-gray-500">
                    <i className="fa-solid fa-info-circle mr-1" />Zonder telefoonnummer probeert het systeem een bestaande chat te hergebruiken — anders krijg je een WhatsApp Web link.
                  </p>
                ) : null}
              </div>
            )}

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Bericht</label>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={isEmail ? 7 : 4}
                placeholder={isEmail ? 'Typ je email…' : 'Typ je bericht…'}
                className="w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
              />
            </div>

            {isEmail ? (
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
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
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleImproveNL}
                disabled={aiLoading === 'improve'}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50"
                title="Verbeter de Nederlandse tekst"
              >
                {aiLoading === 'improve' ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-purple-300 border-t-purple-700" />Verbeteren…
                  </span>
                ) : (
                  <><i className="fa-solid fa-pen-to-square mr-1" />Verbeter NL</>
                )}
              </button>
              <div className="relative" ref={langWrapRef}>
                <button
                  onClick={() => {
                    if (!text.trim()) { toast.warning('Type eerst een bericht'); return; }
                    setShowLangPicker((v) => !v);
                  }}
                  disabled={aiLoading === 'translate'}
                  className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50"
                  title="Vertaal naar een andere taal"
                >
                  {aiLoading === 'translate' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-purple-300 border-t-purple-700" />Vertalen…
                    </span>
                  ) : (
                    <><i className="fa-solid fa-earth-europe mr-1" />Vertaal</>
                  )}
                </button>
                {showLangPicker ? (
                  <div className="absolute bottom-full left-0 z-30 mb-1 min-w-[140px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                    {[['en', 'Engels'], ['de', 'Duits'], ['fr', 'Frans'], ['es', 'Spaans'], ['it', 'Italiaans'], ['nl', 'Nederlands']].map(([code, name]) => (
                      <button
                        key={code}
                        onClick={() => handleTranslate(code)}
                        className="block w-full rounded px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700"
                      >
                        <span className="mr-2 inline-block w-7 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{code}</span>
                        {name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {text.trim() ? (
                <span className="ml-auto text-[11px] text-gray-400">{text.trim().length} tekens</span>
              ) : null}
            </div>
          </section>
        ) : null}
        </>
        )}
      </div>
    </Modal>
  );
}
