import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { NAV_ITEMS } from '../../lib/constants.js';
import Icon from './Icon.jsx';

const RECENT_KEY = 'kyano-cmdk-recent';
const MAX_RECENT = 5;

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function saveRecent(q) {
  if (!q || q.length < 2) return;
  const list = loadRecent().filter((x) => x !== q);
  list.unshift(q);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch { /* full */ }
}

export default function CommandPalette({ open, onClose, onNavigate, onOpenMessage, onOpenContact }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setDebounced('');
      setContacts([]);
      setMessages([]);
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounce query (200ms)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch results when debounced changes
  useEffect(() => {
    if (!open) return;
    if (debounced.length < 1) {
      setContacts([]);
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get(`/contacts?search=${encodeURIComponent(debounced)}&limit=5`).catch(() => ({ contacts: [] })),
      api.get(`/messages?search=${encodeURIComponent(debounced)}&limit=5`).catch(() => ({ messages: [] })),
    ]).then(([c, m]) => {
      if (cancelled) return;
      setContacts(c.contacts || []);
      setMessages(m.messages || []);
      setActive(0);
      setLoading(false);
    });
    return () => { cancelled = true; setLoading(false); };
  }, [debounced, open]);

  // Build flat list of selectable items for keyboard nav
  const actions = useMemo(() => {
    const q = debounced.toLowerCase();
    return NAV_ITEMS
      .filter((n) => !q || n.label.toLowerCase().includes(q))
      .map((n) => ({ kind: 'action', id: `act-${n.id}`, label: n.label, icon: n.icon, viewId: n.id }));
  }, [debounced]);

  const items = useMemo(() => {
    const out = [];
    for (const c of contacts) out.push({ kind: 'contact', id: c.id, label: c.name, subtitle: [c.company, c.email].filter(Boolean).join(' · '), icon: 'user', data: c });
    for (const m of messages) {
      const label = m.subject || (m.contact_name ? `${m.contact_name}` : 'Bericht');
      const subtitle = (m.snippet || '').slice(0, 80);
      out.push({ kind: 'message', id: m.id, label, subtitle, icon: 'envelope', data: m });
    }
    for (const a of actions) out.push(a);
    return out;
  }, [contacts, messages, actions]);

  const recent = !debounced ? loadRecent() : [];

  const choose = useCallback((item) => {
    if (!item) return;
    saveRecent(debounced);
    onClose?.();
    if (item.kind === 'contact') onOpenContact?.(item.data);
    else if (item.kind === 'message') onOpenMessage?.(item.data);
    else if (item.kind === 'action') onNavigate?.(item.viewId);
  }, [debounced, onClose, onOpenContact, onOpenMessage, onNavigate]);

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose?.(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(items.length - 1, i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        choose(items[active]);
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, items, active, choose, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/40 px-4 pt-[10vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10"
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          <Icon name="magnifying-glass" className="text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek contacten, berichten, acties…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
          {loading ? <Icon name="circle-notch" className="animate-spin text-gray-400" /> : null}
          <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">Esc</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1.5 scrollbar-thin">
          {!debounced && recent.length > 0 ? (
            <Section title="Recent">
              {recent.map((r) => (
                <Row
                  key={r}
                  icon="clock-rotate-left"
                  label={r}
                  onClick={() => setQuery(r)}
                />
              ))}
            </Section>
          ) : null}

          {contacts.length ? (
            <Section title={`Contacten · ${contacts.length}`}>
              {contacts.map((c, i) => {
                const idx = i;
                return (
                  <Row
                    key={c.id}
                    icon="user"
                    label={c.name}
                    subtitle={[c.company, c.email].filter(Boolean).join(' · ')}
                    active={items[active]?.id === c.id && items[active]?.kind === 'contact'}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => choose({ kind: 'contact', data: c })}
                  />
                );
              })}
            </Section>
          ) : null}

          {messages.length ? (
            <Section title={`Berichten · ${messages.length}`}>
              {messages.map((m, i) => {
                const idx = contacts.length + i;
                return (
                  <Row
                    key={m.id}
                    icon="envelope"
                    label={m.subject || m.contact_name || 'Bericht'}
                    subtitle={(m.snippet || '').slice(0, 100)}
                    active={items[active]?.id === m.id && items[active]?.kind === 'message'}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => choose({ kind: 'message', data: m })}
                  />
                );
              })}
            </Section>
          ) : null}

          {actions.length ? (
            <Section title="Acties">
              {actions.map((a, i) => {
                const idx = contacts.length + messages.length + i;
                return (
                  <Row
                    key={a.id}
                    icon={a.icon}
                    label={`Open ${a.label}`}
                    active={items[active]?.id === a.id}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => choose(a)}
                  />
                );
              })}
            </Section>
          ) : null}

          {debounced && !loading && items.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              Niets gevonden voor &ldquo;{debounced}&rdquo;
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-2 text-[11px] text-gray-500">
          <div className="flex items-center gap-3">
            <span><kbd className="rounded bg-white px-1.5 py-0.5 shadow-sm">↑↓</kbd> navigeer</span>
            <span><kbd className="rounded bg-white px-1.5 py-0.5 shadow-sm">↵</kbd> open</span>
            <span><kbd className="rounded bg-white px-1.5 py-0.5 shadow-sm">Esc</kbd> sluit</span>
          </div>
          <span className="font-medium">⌘K</span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="py-1">
      <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ icon, label, subtitle, onClick, onMouseEnter, active }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${active ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
    >
      <Icon name={icon} className={`shrink-0 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${active ? 'text-blue-900' : 'text-gray-900'}`}>{label}</div>
        {subtitle ? <div className="truncate text-xs text-gray-500">{subtitle}</div> : null}
      </div>
      {active ? <Icon name="arrow-turn-down" className="rotate-90 text-gray-400" /> : null}
    </button>
  );
}
