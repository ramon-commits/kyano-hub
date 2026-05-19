import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import Avatar from './Avatar.jsx';

const CHANNEL_ICONS = {
  email: { icon: 'fa-envelope', label: 'Email', className: 'text-blue-600' },
  whatsapp: { icon: 'fa-whatsapp', label: 'WhatsApp', className: 'text-green-600', brands: true },
  linkedin: { icon: 'fa-linkedin', label: 'LinkedIn', className: 'text-sky-700', brands: true },
  instagram: { icon: 'fa-instagram', label: 'Instagram', className: 'text-pink-600', brands: true },
};

function ChannelIcons({ channels }) {
  if (!channels || channels.length === 0) return null;
  return (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
      {channels.map((t) => {
        const c = CHANNEL_ICONS[t];
        if (!c) return null;
        return (
          <i
            key={t}
            title={c.label}
            className={`${c.brands ? 'fa-brands' : 'fa-solid'} ${c.icon} ${c.className} text-[13px]`}
          />
        );
      })}
    </span>
  );
}

export default function ContactAutocomplete({
  onSelect,
  placeholder = 'Zoek contact op naam, email of telefoonnummer…',
  channelFilter = null,
  autoFocus = false,
  initialValue = '',
}) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  // Debounced fetch
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/contacts?search=${encodeURIComponent(q)}&with_channels=true&limit=8`);
        let list = r?.contacts || [];
        if (channelFilter) {
          list = list.filter((c) => (c.available_channels || []).includes(channelFilter));
        }
        setResults(list);
        setActiveIdx(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, channelFilter]);

  // Click outside closes dropdown
  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const selectContact = (c) => {
    onSelect?.(c);
    setQuery(c.name || c.email || c.phone || '');
    setOpen(false);
  };

  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.trim());
  const looksLikePhone = /^[+]?[\d\s\-().]{6,}$/.test(query.trim());

  const handleManualEmail = () => {
    onSelect?.({ id: null, name: query.trim(), email: query.trim(), phone: null, available_channels: ['email'], manual: true });
    setOpen(false);
  };
  const handleManualPhone = () => {
    onSelect?.({ id: null, name: query.trim(), email: null, phone: query.trim(), available_channels: ['whatsapp'], manual: true });
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); return; }
            if (!open || results.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => (i + 1) % results.length); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => (i - 1 + results.length) % results.length); }
            else if (e.key === 'Enter') { e.preventDefault(); selectContact(results[activeIdx]); }
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
        />
        {loading ? (
          <i className="fa-solid fa-spinner fa-spin absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
        ) : null}
      </div>

      {open && query.trim() ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-[360px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
          {results.length > 0 ? (
            results.map((c, i) => (
              <button
                key={c.id || `${c.email}-${c.phone}-${i}`}
                onClick={() => selectContact(c)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${i === activeIdx ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              >
                <Avatar name={c.name} initials={c.avatar_initials} color={c.avatar_color} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-gray-900">{c.name || c.email || c.phone}</div>
                  <div className="truncate text-xs text-gray-500">
                    {[c.email, c.phone].filter(Boolean).join(' · ') || (c.company || 'Geen contact-info')}
                  </div>
                </div>
                <ChannelIcons channels={c.available_channels} />
              </button>
            ))
          ) : (
            <div className="p-3">
              <div className="mb-2 text-xs text-gray-500">
                {loading ? 'Zoeken…' : 'Geen contacten gevonden'}
              </div>
              {!loading && looksLikeEmail ? (
                <button
                  onClick={handleManualEmail}
                  className="flex w-full items-center gap-2 rounded-md border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-left text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  <i className="fa-solid fa-envelope" />
                  <span>Stuur naar <strong>{query.trim()}</strong></span>
                </button>
              ) : null}
              {!loading && looksLikePhone && !looksLikeEmail ? (
                <button
                  onClick={handleManualPhone}
                  className="flex w-full items-center gap-2 rounded-md border border-dashed border-green-300 bg-green-50 px-3 py-2 text-left text-sm font-medium text-green-700 hover:bg-green-100"
                >
                  <i className="fa-brands fa-whatsapp" />
                  <span>WhatsApp naar <strong>{query.trim()}</strong></span>
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
