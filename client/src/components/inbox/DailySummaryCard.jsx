import { useState, useEffect } from 'react';
import { useDailySummary } from '../../hooks/useStats.js';
import Avatar from '../shared/Avatar.jsx';

const STORAGE_KEY = 'kyano:dailySummaryDismissed';

function dateToday() { return new Date().toISOString().slice(0, 10); }

export default function DailySummaryCard({ onOpenContact }) {
  const { data } = useDailySummary();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === dateToday()) setDismissed(true);
  }, []);

  if (dismissed || !data) return null;
  const today = data.birthdays_today || [];
  const week = (data.birthdays_week || []).slice(0, 2);
  const nudges = (data.nudges_top3 || []).slice(0, 2);
  const open = data.open_count || 0;
  const urgent = data.urgent_count || 0;

  // Niets relevants — niet tonen
  if (open === 0 && today.length === 0 && week.length === 0 && nudges.length === 0 && urgent === 0) {
    return null;
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond';

  const close = () => {
    localStorage.setItem(STORAGE_KEY, dateToday());
    setDismissed(true);
  };

  return (
    <div className="relative mb-4 overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-sm">
      <button
        onClick={close}
        className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md text-gray-500 transition-colors hover:bg-white/60 hover:text-gray-900"
        aria-label="Verberg samenvatting"
        title="Verberg voor vandaag"
      >
        ×
      </button>
      <h2 className="mb-1 text-base font-semibold text-blue-900">
        {greeting} Ramon
      </h2>
      <p className="mb-3 text-sm text-gray-700">
        {open > 0 ? (
          <>
            <strong>{open}</strong> bericht{open === 1 ? '' : 'en'} wachten op actie
            {urgent > 0 ? <>, waarvan <span className="font-semibold text-red-700">{urgent} urgent</span></> : null}.
          </>
        ) : (
          <>Geen openstaande berichten. Tijd voor koffie. <i className="fa-solid fa-mug-hot" /></>
        )}
      </p>

      <div className="flex flex-wrap gap-3">
        {today.map((c) => (
          <Chip key={c.id} onClick={() => onOpenContact?.(c)} kind="birthday">
            <Avatar name={c.name} initials={c.avatar_initials} color={c.avatar_color} size="xs" />
            <i className="fa-solid fa-cake-candles" /> <strong>{c.name}</strong> is vandaag jarig
          </Chip>
        ))}
        {week.map((c) => (
          <Chip key={c.id} onClick={() => onOpenContact?.(c)} kind="birthday-week">
            <Avatar name={c.name} initials={c.avatar_initials} color={c.avatar_color} size="xs" />
            <i className="fa-solid fa-cake-candles" /> {c.name} <span className="opacity-60">over {c.days_until}d</span>
          </Chip>
        ))}
        {nudges.map((c) => (
          <Chip key={c.id} onClick={() => onOpenContact?.(c)} kind="nudge">
            <Avatar name={c.name} initials={c.avatar_initials} color={c.avatar_color} size="xs" />
            <i className="fa-solid fa-lightbulb" /> {c.name} <span className="opacity-60">— {c.days_since}d stil</span>
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({ children, onClick, kind }) {
  const colors = {
    birthday: 'border-pink-200 bg-pink-50 hover:bg-pink-100 text-pink-900',
    'birthday-week': 'border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-900',
    nudge: 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${colors[kind]}`}
    >
      {children}
    </button>
  );
}
