import { useEffect, useRef, useState } from 'react';

const ACCOUNTS = [
  { id: 'ramon@endlessminds.nl', label: 'ramon@endlessminds.nl' },
  { id: 'ramon@lifeaidbevco.eu', label: 'ramon@lifeaidbevco.eu' },
  { id: 'dach@lifeaidbevco.eu', label: 'dach@lifeaidbevco.eu' },
  { id: 'brugman.ramon@gmail.com', label: 'brugman.ramon@gmail.com' },
];

export default function ReplyComposer({ channelType, defaultAccount, onSend, onCopy, onAI }) {
  const [text, setText] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [from, setFrom] = useState(defaultAccount || ACCOUNTS[0].id);
  const ref = useRef(null);

  useEffect(() => {
    setFrom(defaultAccount || ACCOUNTS[0].id);
  }, [defaultAccount]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSend?.({ text, from, cc, bcc });
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
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-500"
          >
            {ACCOUNTS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
          <button
            onClick={() => setShowCcBcc((v) => !v)}
            className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-700"
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
            placeholder="CC: email@example.com"
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
            placeholder="BCC: email@example.com"
            className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      ) : null}

      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Typ je antwoord…"
        rows={4}
        className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          📤 Verstuur
        </button>
        <button
          onClick={handleCopy}
          disabled={!text.trim()}
          className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          📋 Kopieer
        </button>
        <button
          onClick={onAI}
          className="rounded-md border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100"
        >
          🤖 AI varianten
        </button>
        {text.trim() ? (
          <span className="ml-auto text-xs text-gray-400">{text.trim().length} tekens</span>
        ) : null}
      </div>
    </div>
  );
}
