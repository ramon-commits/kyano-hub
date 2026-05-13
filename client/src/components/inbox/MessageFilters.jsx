import { useEffect, useState } from 'react';
import { cn, debounce } from '../../lib/utils.js';

const FILTERS = [
  { id: 'all', label: 'Alle', icon: '📥' },
  { id: 'email', label: 'Email', icon: '✉️' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼' },
];

export default function MessageFilters({ channelFilter, onChannelFilter, search, onSearch, extra }) {
  const [local, setLocal] = useState(search || '');

  useEffect(() => { setLocal(search || ''); }, [search]);

  useEffect(() => {
    const dbn = debounce((v) => onSearch?.(v), 300);
    dbn(local);
  }, [local, onSearch]);

  return (
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
      <div className="inline-flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => onChannelFilter(f.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all',
              channelFilter === f.id
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
            )}
          >
            <span className="leading-none">{f.icon}</span>
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        <input
          type="text"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder="Zoek op naam, inhoud of notitie…"
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
        />
        {local ? (
          <button
            onClick={() => setLocal('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ×
          </button>
        ) : null}
      </div>

      {extra}
    </div>
  );
}
