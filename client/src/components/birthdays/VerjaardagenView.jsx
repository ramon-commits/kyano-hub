import { useBirthdays } from '../../hooks/useContacts.js';
import Avatar from '../shared/Avatar.jsx';
import Badge from '../shared/Badge.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import PageHeader from '../shared/PageHeader.jsx';
import { formatDateShort } from '../../lib/utils.js';

export default function VerjaardagenView({ onOpenContact, onSchedule }) {
  const { data, isLoading } = useBirthdays(30);
  const birthdays = data?.birthdays || [];

  const label = (d) => {
    if (d === 0) return { text: 'VANDAAG!', color: '#9d174d', bg: '#fce7f3', bold: true, icon: 'cake-candles' };
    if (d === 1) return { text: 'Morgen', color: '#ea580c', bg: '#fff7ed' };
    if (d <= 7) return { text: `Over ${d}d`, color: '#9d174d', bg: '#fdf2f8' };
    return { text: `Over ${d}d`, color: '#6b7280', bg: '#f3f4f6' };
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Verjaardagen"
        subtitle={`Komende 30 dagen — ${birthdays.length} ${birthdays.length === 1 ? 'contact' : 'contacten'}`}
      />

      <div className="flex-1 overflow-y-auto bg-gray-50 scrollbar-thin">
        <div className="mx-8 my-6">
          {isLoading ? (
            <LoadingSpinner label="Verjaardagen laden…" />
          ) : birthdays.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white">
              <EmptyState
                icon="cake-candles"
                title="Geen verjaardagen deze maand"
                description="Zodra contacten een verjaardag hebben in de komende 30 dagen, verschijnen ze hier."
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              {birthdays.map((b) => {
                const lab = label(b.days_until);
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-4 border-b border-gray-100 px-5 py-4 transition-colors last:border-b-0 hover:bg-gray-50"
                  >
                    <Avatar name={b.name} initials={b.avatar_initials} color={b.avatar_color} size="lg" />
                    <button onClick={() => onOpenContact?.(b)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-semibold text-gray-900">{b.name}</div>
                      {b.company ? <div className="truncate text-xs text-gray-500">{b.company}</div> : null}
                      <div className="mt-1 text-[11px] text-gray-500">
                        <i className="fa-solid fa-cake-candles mr-1" />{formatDateShort(`${b.birthday}T00:00:00`)} · {b.next_birthday}
                      </div>
                    </button>
                    <Badge color={lab.color} bg={lab.bg} size="lg" className={lab.bold ? 'font-bold' : ''}>
                      {lab.text}
                    </Badge>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => onOpenContact?.(b)}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        <i className="fa-solid fa-comment mr-1.5" />Feliciteren
                      </button>
                      <button
                        onClick={() => onSchedule?.(b)}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        <i className="fa-solid fa-calendar-days mr-1.5" />Plan
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
