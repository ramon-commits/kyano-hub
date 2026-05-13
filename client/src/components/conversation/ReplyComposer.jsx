import { useEffect, useRef, useState } from 'react';

export default function ReplyComposer({ channelType, defaultAccount, sending, onSend, onCopy, onAI, onImproveNL, onTranslate, onFollowUp }) {
  const [text, setText] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    setText('');
    setCc('');
    setBcc('');
    setShowCcBcc(false);
  }, [defaultAccount]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
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

      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={isEmail ? 'Typ je antwoord… (⌘/Ctrl+Enter om te versturen)' : 'Typ je bericht…'}
        rows={4}
        disabled={sending}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSend();
          }
        }}
        className="min-h-[100px] w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Verzenden…
            </span>
          ) : (
            <>📤 Verstuur</>
          )}
        </button>
        <button
          onClick={handleCopy}
          disabled={!text.trim() || sending}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          📋 Kopieer
        </button>
        <button
          onClick={onAI}
          disabled={sending}
          className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
        >
          🤖 AI varianten
        </button>

        <span className="mx-1 hidden h-6 w-px self-center bg-gray-200 sm:inline-block" />

        <button
          onClick={onImproveNL}
          disabled={sending}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50"
          title="Verbeter de Nederlandse schrijfstijl (stap 12)"
        >
          ✍️ Verbeter NL
        </button>
        <button
          onClick={onTranslate}
          disabled={sending}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50"
          title="Vertaal naar andere taal (stap 12)"
        >
          🌍 Vertaal
        </button>
        <button
          onClick={onFollowUp}
          disabled={sending}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50"
          title="Schrijf een follow-up suggestie (stap 12)"
        >
          ↩️ Follow-up
        </button>

        {text.trim() ? (
          <span className="ml-auto text-xs text-gray-400">{text.trim().length} tekens</span>
        ) : null}
      </div>
    </div>
  );
}
