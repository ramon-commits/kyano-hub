import { useState, useEffect } from 'react';
import { useDailySummary } from '../../hooks/useStats.js';

const STORAGE_KEY = 'kyano:dailySummaryDismissed';

function dateToday() { return new Date().toISOString().slice(0, 10); }

export default function DailySummaryCard() {
  const { data } = useDailySummary();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === dateToday()) setDismissed(true);
  }, []);

  if (dismissed || !data) return null;
  const today = data.birthdays_today || [];
  const week = data.birthdays_week || [];
  const nudges = data.nudges_top3 || [];
  const open = data.open_count || 0;

  // Pick the most relevant birthday for the one-liner
  let birthdayBit = '';
  if (today.length > 0) {
    birthdayBit = ` · ${today[0].name} jarig vandaag`;
  } else if (week.length > 0 && week[0].days_until <= 1) {
    birthdayBit = ` · ${week[0].name} jarig ${week[0].days_until === 0 ? 'vandaag' : 'morgen'}`;
  }

  const nudgeBit = nudges.length > 0 ? ` · ${nudges.length} contact${nudges.length === 1 ? '' : 'en'} wachten` : '';

  // Niets relevants — niet tonen
  if (open === 0 && !birthdayBit && !nudgeBit) return null;

  const close = () => {
    localStorage.setItem(STORAGE_KEY, dateToday());
    setDismissed(true);
  };

  return (
    <div className="flex items-center justify-between px-1 py-2 text-sm text-gray-500">
      <span>
        {open > 0 ? <>{open} bericht{open === 1 ? '' : 'en'} wachten</> : <>Inbox zero</>}
        {birthdayBit}
        {nudgeBit}
      </span>
      <button
        onClick={close}
        className="text-gray-300 transition-colors hover:text-gray-500"
        aria-label="Verberg samenvatting"
        title="Verberg voor vandaag"
      >
        <i className="fa-solid fa-xmark text-xs" />
      </button>
    </div>
  );
}
