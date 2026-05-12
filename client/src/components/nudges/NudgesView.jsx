import { useState } from 'react';
import { useNudges } from '../../hooks/useContacts.js';
import Avatar from '../shared/Avatar.jsx';
import Badge from '../shared/Badge.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import { cn } from '../../lib/utils.js';

const THRESHOLDS = [
  { id: 0, label: 'Toon iedereen' },
  { id: 7, label: '> 7 dagen' },
  { id: 14, label: '> 14 dagen' },
  { id: 21, label: '> 21 dagen' },
];

function severityFor(days) {
  if (days >= 21) return { color: '#dc2626', bg: '#fef2f2', label: 'Wordt tijd!', icon: '🔴' };
  if (days >= 14) return { color: '#ea580c', bg: '#fff7ed', label: 'Even checken', icon: '🟠' };
  if (days >= 7) return { color: '#a16207', bg: '#fef3c7', label: 'Op je radar', icon: '🟡' };
  return { color: '#6b7280', bg: '#f3f4f6', label: 'Recent', icon: '⚪' };
}

export default function NudgesView({ onOpenContact, onSchedule }) {
  const [threshold, setThreshold] = useState(0);
  const { data, isLoading } = useNudges(threshold);
  const nudges = data?.nudges || [];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-8 py-5">
        <h1 className="text-xl font-semibold text-gray-900">💡 Relationship Nudges</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Contacten die wachten op een seintje van jou — {nudges.length} matches
        </p>
        <div className="mt-3 inline-flex rounded-lg bg-gray-100 p-0.5">
          {THRESHOLDS.map((t) => (
            <button
              key={t.id}
              onClick={() => setThreshold(t.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                threshold === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-8 my-6">
          {isLoading ? (
            <LoadingSpinner label="Nudges laden…" />
          ) : nudges.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white">
              <EmptyState
                icon="💡"
                title="Alles onder controle"
                description="Geen contacten die om een seintje vragen. Verlaag de drempel om eerder gewaarschuwd te worden."
              />
            </div>
          ) : (
            <div className="space-y-2">
              {nudges.map((n) => {
                const sev = severityFor(n.days_since_last);
                return (
                  <div
                    key={n.id}
                    className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md"
                  >
                    <Avatar name={n.name} initials={n.avatar_initials} color={n.avatar_color} size="lg" />
                    <button onClick={() => onOpenContact?.(n)} className="min-w-0 flex-1 text-left">
                      <div className="truncate font-semibold text-gray-900">{n.name}</div>
                      {n.company ? <div className="truncate text-sm text-gray-500">{n.company}</div> : null}
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <Badge color={sev.color} bg={sev.bg}>
                          {sev.icon} {n.days_since_last}d geleden
                        </Badge>
                        <span className="text-gray-500">{sev.label}</span>
                      </div>
                    </button>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => onSchedule?.(n)}
                        className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        📅 Plan
                      </button>
                      <button
                        onClick={() => onOpenContact?.(n)}
                        className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        💬 Bericht
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
