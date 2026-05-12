import { useState } from 'react';
import Sidebar from './components/layout/Sidebar.jsx';
import PlaceholderView from './components/views/PlaceholderView.jsx';
import { useHealth } from './hooks/useStats.js';

const VIEW_LABELS = {
  inbox: { title: 'Inbox', hint: 'Berichten-lijst en quick actions volgen in stap 2.' },
  snoozed: { title: 'Snoozed', hint: 'Wake-up timeline volgt in stap 2.' },
  logboek: { title: 'Logboek', hint: 'Afgehandelde berichten met FTS-zoeken volgt in stap 5.' },
  contacten: { title: 'Contacten', hint: 'CRM-lite met merge & history volgt in stap 6.' },
  verjaardagen: { title: 'Verjaardagen', hint: 'Birthday dashboard volgt in stap 7.' },
  nudges: { title: 'Nudges', hint: 'Stille-relaties-detector volgt in stap 7.' },
  calendar: { title: 'Calendar', hint: 'Google Calendar integratie volgt in stap 8.' },
  projecten: { title: 'Projecten', hint: 'Project-kits volgt in stap 10.' },
  analytics: { title: 'Analytics', hint: 'Insights dashboard volgt in stap 12.' },
  ask: { title: 'Vraag aan AI', hint: 'Claude chat-interface volgt in stap 11.' },
  instellingen: { title: 'Instellingen', hint: 'OAuth verbindingen en config volgt in stap 4.' },
};

function HealthBadge() {
  const { data, isError, isLoading } = useHealth();
  if (isLoading) return <Badge color="gray" label="Verbinden…" dot="bg-gray-400" />;
  if (isError || !data) return <Badge color="red" label="Disconnected ❌" dot="bg-red-500" />;
  return (
    <Badge
      color="green"
      label={`Connected ✅ · ${data.messages ?? 0} msg · ${data.contacts ?? 0} contacten`}
      dot="bg-green-500"
    />
  );
}

function Badge({ label, dot }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-200">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span>{label}</span>
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState('inbox');
  const view = VIEW_LABELS[active] || VIEW_LABELS.inbox;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      <Sidebar active={active} onSelect={setActive} />

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-8 py-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{view.title}</h1>
            <p className="text-xs text-gray-500">Stap 1 — fundament. Echte data en flows volgen.</p>
          </div>
          <HealthBadge />
        </header>

        <section className="flex-1 overflow-y-auto">
          <PlaceholderView title={view.title} hint={view.hint} />
        </section>
      </main>
    </div>
  );
}
