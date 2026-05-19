import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils.js';

const FILTERS = [
  { id: 'all', label: 'Alle', icon: 'inbox', brand: false },
  { id: 'email', label: 'Email', icon: 'envelope', brand: false },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp', brand: true },
  { id: 'linkedin', label: 'LinkedIn', icon: 'linkedin', brand: true },
];

export default function MessageFilters({ channelFilter, onChannelFilter, search, onSearch, extra }) {
  const [local, setLocal] = useState(search || '');

  // Sync local input with externe wijzigingen (bv. clear vanuit parent)
  useEffect(() => { setLocal(search || ''); }, [search]);

  const submit = () => onSearch?.(local.trim());
  const clear = () => { setLocal(''); onSearch?.(''); };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); clear(); }
  };

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
            <i className={`${f.brand ? 'fa-brands' : 'fa-solid'} fa-${f.icon} leading-none`} />
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><i className="fa-solid fa-magnifying-glass" /></span>
          <input
            type="text"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Zoek en druk Enter…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-20 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
          />
          {local ? (
            <button
              type="button"
              onClick={clear}
              aria-label="Wis zoekterm"
              className="absolute right-14 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={submit}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Zoek
          </button>
        </div>

        {search ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
            <i className="fa-solid fa-magnifying-glass text-[10px]" />
            "{search}"
            <button
              type="button"
              onClick={clear}
              aria-label="Wis actieve zoekterm"
              className="ml-0.5 text-blue-500 hover:text-blue-800"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </span>
        ) : null}
      </div>

      {extra}
    </div>
  );
}
