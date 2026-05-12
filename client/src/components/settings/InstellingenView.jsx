import { useState } from 'react';
import ChannelsSettings from './ChannelsSettings.jsx';
import { cn } from '../../lib/utils.js';

const TABS = [
  { id: 'channels', label: 'Kanalen', icon: '📡' },
  { id: 'style', label: 'Stijl', icon: '🎨' },
  { id: 'account', label: 'Account', icon: '👤' },
];

export default function InstellingenView() {
  const [tab, setTab] = useState('channels');

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-8 py-5">
        <h1 className="text-xl font-semibold text-gray-900">⚙️ Instellingen</h1>
        <p className="mt-0.5 text-sm text-gray-500">Beheer kanalen, stijl, en je account</p>
        <div className="mt-4 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all',
                tab === t.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100',
              )}
            >
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-8 my-6">
          {tab === 'channels' ? <ChannelsSettings /> : null}
          {tab === 'style' ? (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
              🎨 Stijlprofiel wordt gebouwd in stap 11. Hier komen je communicatie-DNA, signatures, en per-kanaal toon.
            </div>
          ) : null}
          {tab === 'account' ? (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-6">
              <Row label="Naam" value="Ramon Brugman" />
              <Row label="Email" value="ramon@endlessminds.nl" />
              <Row label="Rol" value="CEO — Endless Minds / Kyano Horaizon" />
              <Row label="Versie" value="Kyano Comm Hub v1.0 (stap 2)" />
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
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className="text-sm text-gray-900">{value}</div>
    </div>
  );
}
