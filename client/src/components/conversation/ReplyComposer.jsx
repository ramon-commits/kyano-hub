import { useEffect, useMemo, useRef, useState } from 'react';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { useQuickReplies } from '../../hooks/useQuickReplies.js';

// Detect a /shortcut at the current cursor: must be at start, or preceded by whitespace.
function findTriggerAt(text, caret) {
  if (caret == null) caret = text.length;
  const before = text.slice(0, caret);
  // Walk back to find the start of the current word
  const match = before.match(/(^|\s)(\/\w*)$/);
  if (!match) return null;
  const trigger = match[2];
  const start = caret - trigger.length;
  return { trigger, start, end: caret };
}

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export default function ReplyComposer({ channelType, defaultAccount, sending, onSend, onSendMedia, onCopy, onAI, onImproveNL, onTranslate, onFollowUp }) {
  const [text, setText] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [caret, setCaret] = useState(0);
  const [activeMatch, setActiveMatch] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [attachError, setAttachError] = useState(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const ref = useRef(null);
  const emojiWrapRef = useRef(null);
  const fileInputRef = useRef(null);

  const { data: qrData } = useQuickReplies(channelType);
  const quickReplies = qrData?.quick_replies || [];

  useEffect(() => {
    setText('');
    setCc('');
    setBcc('');
    setShowCcBcc(false);
    setCaret(0);
    setShowEmoji(false);
    setAttachedFiles([]);
    setAttachError(null);
  }, [defaultAccount]);

  // Cleanup blob URLs voor previews
  const previewUrls = useMemo(
    () => attachedFiles.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)),
    [attachedFiles],
  );
  useEffect(() => () => {
    for (const u of previewUrls) if (u) URL.revokeObjectURL(u);
  }, [previewUrls]);

  const supportsMedia = channelType === 'whatsapp' || channelType === 'linkedin' || channelType === 'instagram';

  function handleFilesPicked(fileList) {
    setAttachError(null);
    if (!fileList?.length) return;
    const accepted = [];
    let oversize = 0;
    for (const f of fileList) {
      if (f.size > MAX_FILE_BYTES) { oversize += 1; continue; }
      accepted.push(f);
    }
    setAttachedFiles((prev) => {
      const next = [...prev, ...accepted];
      if (next.length > MAX_FILES) {
        setAttachError(`Maximaal ${MAX_FILES} bestanden`);
        return next.slice(0, MAX_FILES);
      }
      return next;
    });
    if (oversize) setAttachError(`${oversize} bestand(en) te groot (max 10MB)`);
  }

  function removeAttachment(idx) {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
    setAttachError(null);
  }

  // Listen for "r" shortcut from App — focus the textarea
  useEffect(() => {
    function onFocusEvent() {
      ref.current?.focus();
    }
    window.addEventListener('focus-reply-composer', onFocusEvent);
    return () => window.removeEventListener('focus-reply-composer', onFocusEvent);
  }, []);

  // Listen for external "set text" (bv. Follow-up vanuit ThreadStatusBar)
  useEffect(() => {
    function onSetText(e) {
      const next = typeof e.detail === 'string' ? e.detail : (e.detail?.text || '');
      if (!next) return;
      setText(next);
      requestAnimationFrame(() => {
        if (ref.current) {
          ref.current.focus();
          ref.current.setSelectionRange(next.length, next.length);
          setCaret(next.length);
        }
      });
    }
    window.addEventListener('reply-composer-set-text', onSetText);
    return () => window.removeEventListener('reply-composer-set-text', onSetText);
  }, []);

  // Click-outside / Esc to close the emoji picker
  useEffect(() => {
    if (!showEmoji) return undefined;
    function onDocDown(e) {
      if (emojiWrapRef.current && !emojiWrapRef.current.contains(e.target)) {
        setShowEmoji(false);
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') setShowEmoji(false);
    }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showEmoji]);

  const insertEmoji = (emoji) => {
    const native = emoji?.native || '';
    if (!native) return;
    const start = ref.current?.selectionStart ?? caret ?? text.length;
    const end = ref.current?.selectionEnd ?? start;
    const next = text.slice(0, start) + native + text.slice(end);
    setText(next);
    const pos = start + native.length;
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.focus();
        ref.current.setSelectionRange(pos, pos);
        setCaret(pos);
      }
    });
    setShowEmoji(false);
  };

  const trigger = useMemo(() => findTriggerAt(text, caret), [text, caret]);
  const matches = useMemo(() => {
    if (!trigger) return [];
    return quickReplies.filter((r) => r.shortcut.toLowerCase().startsWith(trigger.trigger.toLowerCase())).slice(0, 5);
  }, [trigger, quickReplies]);
  const showDropdown = matches.length > 0 && trigger;

  // Reset activeMatch when trigger or matches change
  useEffect(() => { setActiveMatch(0); }, [trigger?.trigger, matches.length]);

  const insertTemplate = (qr) => {
    if (!trigger) return;
    const next = text.slice(0, trigger.start) + qr.body + text.slice(trigger.end);
    setText(next);
    // Move caret to end of inserted template
    requestAnimationFrame(() => {
      if (ref.current) {
        const pos = trigger.start + qr.body.length;
        ref.current.focus();
        ref.current.setSelectionRange(pos, pos);
        setCaret(pos);
      }
    });
  };

  const handleSend = async () => {
    if (sending) return;
    if (attachedFiles.length > 0) {
      if (!onSendMedia) return;
      const ok = await onSendMedia({ text, files: attachedFiles });
      if (ok) {
        setText('');
        setAttachedFiles([]);
        setAttachError(null);
      }
      return;
    }
    if (!text.trim()) return;
    const ok = await onSend?.({ text, cc, bcc });
    if (ok) {
      setText('');
      setCc('');
      setBcc('');
    }
  };

  const handleCopy = async () => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      onCopy?.(true);
    } catch {
      onCopy?.(false);
    }
  };

  const isEmail = channelType === 'email';

  return (
    <div className="border-t border-gray-200 bg-white px-6 py-4">
      {isEmail ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-gray-500">Van:</span>
          <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-900">
            {defaultAccount || 'Onbekend account'}
          </span>
          <button
            onClick={() => setShowCcBcc((v) => !v)}
            className="ml-auto text-xs font-medium text-blue-600 transition-colors hover:text-blue-700"
          >
            {showCcBcc ? 'CC/BCC verbergen' : 'CC/BCC tonen'}
          </button>
        </div>
      ) : null}

      {isEmail && showCcBcc ? (
        <div className="mb-3 space-y-2">
          <input
            type="text"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="CC: email@example.com (comma-separated voor meerdere)"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
          />
          <input
            type="text"
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
            placeholder="BCC: email@example.com"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
          />
        </div>
      ) : null}

      {attachedFiles.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          {attachedFiles.map((f, i) => {
            const preview = previewUrls[i];
            const isImg = f.type.startsWith('image/');
            return (
              <div key={`${f.name}-${i}`} className="group relative">
                {isImg && preview ? (
                  <img
                    src={preview}
                    alt={f.name}
                    className="h-16 w-16 rounded-md object-cover ring-1 ring-gray-200"
                  />
                ) : (
                  <div className="flex h-16 min-w-[160px] max-w-[220px] items-center gap-2 rounded-md bg-white px-3 text-xs ring-1 ring-gray-200">
                    <i className={`fa-solid ${f.type.startsWith('video/') ? 'fa-film' : 'fa-file'} text-gray-500`} />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900">{f.name}</div>
                      <div className="text-[10px] text-gray-500">{Math.max(1, Math.round(f.size / 1024))} KB</div>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-[10px] text-white opacity-0 shadow-sm transition-opacity hover:bg-red-600 group-hover:opacity-100"
                  aria-label="Bijlage verwijderen"
                  title="Verwijderen"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      {attachError ? (
        <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          <i className="fa-solid fa-triangle-exclamation mr-1" />{attachError}
        </div>
      ) : null}

      <div className="relative">
        {showDropdown ? (
          <div className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Quick replies · {trigger.trigger}
            </div>
            {matches.map((r, i) => (
              <button
                key={r.id}
                onClick={() => insertTemplate(r)}
                onMouseEnter={() => setActiveMatch(i)}
                className={`flex w-full items-start gap-3 px-3 py-2 text-left transition-colors ${i === activeMatch ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              >
                <span className={`mt-0.5 inline-block min-w-[80px] rounded-md px-2 py-0.5 text-[11px] font-mono font-semibold ${i === activeMatch ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                  {r.shortcut}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900">{r.title}</div>
                  <div className="truncate text-xs text-gray-500">{r.body}</div>
                </div>
              </button>
            ))}
            <div className="border-t border-gray-100 bg-gray-50 px-3 py-1 text-[10px] text-gray-500">
              ↑↓ navigeer · ↵ invoegen · Esc sluiten
            </div>
          </div>
        ) : null}

        <textarea
          ref={ref}
          value={text}
          onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart); }}
          onKeyUp={(e) => setCaret(e.target.selectionStart)}
          onClick={(e) => setCaret(e.target.selectionStart)}
          placeholder={isEmail ? 'Typ je antwoord… (⌘/Ctrl+Enter om te versturen · / voor templates)' : 'Typ je bericht…'}
          rows={4}
          disabled={sending}
          onKeyDown={(e) => {
            if (showDropdown) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveMatch((i) => (i + 1) % matches.length); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActiveMatch((i) => (i - 1 + matches.length) % matches.length); return; }
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); insertTemplate(matches[activeMatch]); return; }
              if (e.key === 'Escape') {
                e.preventDefault();
                // Clear the trigger so the dropdown closes (replace /text with nothing)
                const next = text.slice(0, trigger.start) + text.slice(trigger.end);
                setText(next);
                requestAnimationFrame(() => {
                  if (ref.current) {
                    ref.current.setSelectionRange(trigger.start, trigger.start);
                    setCaret(trigger.start);
                  }
                });
                return;
              }
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
          className="min-h-[100px] w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={handleSend}
          disabled={(!text.trim() && attachedFiles.length === 0) || sending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Verzenden…
            </span>
          ) : (
            <><i className="fa-solid fa-paper-plane mr-1.5" />Verstuur</>
          )}
        </button>
        <button
          onClick={handleCopy}
          disabled={!text.trim() || sending}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <i className="fa-solid fa-clipboard-list mr-1.5" />Kopieer
        </button>
        <button
          onClick={onAI}
          disabled={sending}
          className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
        >
          <i className="fa-solid fa-robot mr-1.5" />AI varianten
        </button>

        <span className="mx-1 hidden h-6 w-px self-center bg-gray-200 sm:inline-block" />

        <button
          onClick={onImproveNL}
          disabled={sending}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50"
          title="Verbeter de Nederlandse schrijfstijl (stap 12)"
        >
          <i className="fa-solid fa-pen-to-square mr-1.5" />Verbeter NL
        </button>
        <button
          onClick={onTranslate}
          disabled={sending}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50"
          title="Vertaal naar andere taal (stap 12)"
        >
          <i className="fa-solid fa-earth-europe mr-1.5" />Vertaal
        </button>
        <button
          onClick={async () => {
            if (!onFollowUp || followUpLoading) return;
            setFollowUpLoading(true);
            try {
              const result = await onFollowUp();
              if (result?.text) {
                setText(result.text);
                requestAnimationFrame(() => {
                  if (ref.current) {
                    ref.current.focus();
                    const pos = result.text.length;
                    ref.current.setSelectionRange(pos, pos);
                    setCaret(pos);
                  }
                });
              }
            } finally {
              setFollowUpLoading(false);
            }
          }}
          disabled={sending || followUpLoading}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50"
          title="Genereer follow-up bericht op basis van deze thread"
        >
          {followUpLoading ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-purple-300 border-t-purple-600" />
              Genereren…
            </span>
          ) : (
            <><i className="fa-solid fa-reply mr-1.5" />Follow-up</>
          )}
        </button>

        {supportsMedia ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.doc,.docx"
              onChange={(e) => {
                handleFilesPicked(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || attachedFiles.length >= MAX_FILES}
              aria-label="Foto of bestand toevoegen"
              title={attachedFiles.length >= MAX_FILES ? `Max ${MAX_FILES} bestanden` : 'Foto of bestand toevoegen'}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <i className="fa-regular fa-image" />
            </button>
          </>
        ) : null}

        <div className="relative" ref={emojiWrapRef}>
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            disabled={sending}
            aria-label="Emoji invoegen"
            title="Emoji invoegen"
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              showEmoji
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700'
            }`}
          >
            <i className="fa-regular fa-face-smile" />
          </button>
          {showEmoji ? (
            <div className="absolute bottom-full right-0 z-30 mb-2 origin-bottom-right">
              <Picker
                data={emojiData}
                onEmojiSelect={insertEmoji}
                theme="light"
                locale="nl"
                previewPosition="none"
                skinTonePosition="none"
                navPosition="top"
                autoFocus
              />
            </div>
          ) : null}
        </div>

        {text.trim() ? (
          <span className="ml-auto text-xs text-gray-400">{text.trim().length} tekens</span>
        ) : null}
      </div>
    </div>
  );
}
