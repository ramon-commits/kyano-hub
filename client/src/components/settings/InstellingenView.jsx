import { useState } from 'react';
import ChannelsSettings from './ChannelsSettings.jsx';
import UnipileSettings from './UnipileSettings.jsx';
import BirthdayImportSettings from './BirthdayImportSettings.jsx';
import PageHeader from '../shared/PageHeader.jsx';
import { cn } from '../../lib/utils.js';

const TABS = [
  { id: 'channels', label: 'Kanalen', icon: 'tower-broadcast' },
  { id: 'import', label: 'Import', icon: 'cloud-arrow-up' },
  { id: 'style', label: 'Stijl', icon: 'palette' },
  { id: 'account', label: 'Account', icon: 'user' },
];

export default function InstellingenView() {
  const [tab, setTab] = useState('channels');

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Instellingen" subtitle="Beheer kanalen, stijl, en je account">
        <div className="inline-flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all',
                tab === t.id
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
              )}
            >
              <i className={`fa-solid fa-${t.icon}`} />{t.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto bg-gray-50 scrollbar-thin">
        <div className="mx-8 my-6">
          {tab === 'channels' ? (
            <div className="space-y-6">
              <ChannelsSettings />
              <div className="border-t border-gray-200 pt-6">
                <UnipileSettings />
              </div>
            </div>
          ) : null}
          {tab === 'import' ? <BirthdayImportSettings /> : null}
          {tab === 'style' ? (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
              <i className="fa-solid fa-palette mr-1.5" />Stijlprofiel wordt gebouwd in stap 11. Hier komen je communicatie-DNA, signatures, en per-kanaal toon.
            </div>
          ) : null}
          {tab === 'account' ? (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <Row label="Naam" value="Ramon Brugman" />
              <Row label="Email" value="ramon@endlessminds.nl" />
              <Row label="Rol" value="CEO — Endless Minds / Kyano Horaizon" />
              <Row label="Versie" value="Kyano Comm Hub v1.0" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 pb-3 last:border-0 last:pb-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">{label}</div>
      <div className="text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}
