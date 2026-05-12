import { useEffect, useState } from 'react';
import { cn, debounce } from '../../lib/utils.js';

const FILTERS = [
  { id: 'all', label: 'Alle', icon: '📥' },
  { id: 'email', label: 'Email', icon: '✉️' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
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
      <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => onChannelFilter(f.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              channelFilter === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900',
            )}
          >
            <span>{f.icon}</span>
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
          placeholder="Zoek in berichten…"
          className="w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
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
