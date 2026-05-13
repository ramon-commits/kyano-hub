import { useState } from 'react';
import { useNudges, useUpdateNudgeSettings } from '../../hooks/useContacts.js';
import Avatar from '../shared/Avatar.jsx';
import Badge from '../shared/Badge.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import PageHeader from '../shared/PageHeader.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { cn } from '../../lib/utils.js';

const THRESHOLDS = [
  { id: 0, label: 'Toon iedereen' },
  { id: 7, label: '> 7 dagen' },
  { id: 14, label: '> 14 dagen' },
  { id: 21, label: '> 21 dagen' },
];

function severityFor(days) {
  if (days >= 21) return { color: '#dc2626', bg: '#fef2f2', label: 'Wordt tijd!', textCls: 'text-red-600 font-bold' };
  if (days >= 14) return { color: '#ea580c', bg: '#fff7ed', label: 'Even checken', textCls: 'text-orange-600' };
  if (days >= 7)  return { color: '#a16207', bg: '#fef3c7', label: 'Op je radar', textCls: 'text-amber-600' };
  return { color: '#6b7280', bg: '#f3f4f6', label: 'Recent', textCls: 'text-gray-500' };
}

export default function NudgesView({ onOpenContact, onSchedule }) {
  const [threshold, setThreshold] = useState(0);
  const { data, isLoading } = useNudges(threshold);
  const nudges = data?.nudges || [];
  const updateNudge = useUpdateNudgeSettings();
  const toast = useToast();

  const mute = async (c) => {
    try {
      await updateNudge.mutateAsync({ id: c.id, is_active: false });
      toast.info(`Nudges voor ${c.name} uitgezet`, '🔇 Gemuted');
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="💡 Relationship Nudges"
        subtitle={`${nudges.length} ${nudges.length === 1 ? 'contact' : 'contacten'} wachten op een seintje`}
      >
        <div className="inline-flex flex-wrap gap-1.5">
          {THRESHOLDS.map((t) => (
            <button
              key={t.id}
              onClick={() => setThreshold(t.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-all',
                threshold === t.id
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto bg-gray-50 scrollbar-thin">
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
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              {nudges.map((n) => {
                const sev = severityFor(n.days_since_last);
                return (
                  <div
                    key={n.id}
                    className="flex items-center gap-4 border-b border-gray-100 px-5 py-4 transition-colors last:border-b-0 hover:bg-gray-50"
                  >
                    <Avatar name={n.name} initials={n.avatar_initials} color={n.avatar_color} size="lg" />
                    <button onClick={() => onOpenContact?.(n)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-semibold text-gray-900">{n.name}</div>
                      {n.company ? <div className="truncate text-xs text-gray-500">{n.company}</div> : null}
                      <div className="mt-1 flex items-center gap-2 text-[11px]">
                        <Badge color={sev.color} bg={sev.bg}>{n.days_since_last}d geleden</Badge>
                        <span className={sev.textCls}>{sev.label}</span>
                      </div>
                    </button>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => onSchedule?.(n)}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        📅 Plan
                      </button>
                      <button
                        onClick={() => onOpenContact?.(n)}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        💬 Bericht
                      </button>
                      <button
                        onClick={() => mute(n)}
                        title="Geen nudges meer voor dit contact"
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                      >
                        🔇 Mute
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
