import { useCallback, useMemo, useState } from 'react';
import Sidebar from './components/layout/Sidebar.jsx';
import InboxView from './components/inbox/InboxView.jsx';
import SnoozedView from './components/snoozed/SnoozedView.jsx';
import LogboekView from './components/logboek/LogboekView.jsx';
import ContactenView from './components/contacts/ContactenView.jsx';
import VerjaardagenView from './components/birthdays/VerjaardagenView.jsx';
import NudgesView from './components/nudges/NudgesView.jsx';
import CalendarView from './components/calendar/CalendarView.jsx';
import ProjectenView from './components/projects/ProjectenView.jsx';
import InstellingenView from './components/settings/InstellingenView.jsx';
import PlaceholderView from './components/views/PlaceholderView.jsx';
import ConversationView from './components/conversation/ConversationView.jsx';
import ContactDetail from './components/contacts/ContactDetail.jsx';
import SnoozeModal from './components/modals/SnoozeModal.jsx';
import DoneModal from './components/modals/DoneModal.jsx';
import ScheduleModal from './components/modals/ScheduleModal.jsx';
import { useHealth } from './hooks/useStats.js';
import { useArchiveMessage, useDoneMessage, usePriorityMessage, useReopenMessage, useSnoozeMessage, useWaitingMessage } from './hooks/useMessages.js';
import { useToast } from './hooks/useToast.jsx';
import { useKeyboard } from './hooks/useKeyboard.js';
import { NAV_ITEMS } from './lib/constants.js';

function HealthBadge() {
  const { data, isError, isLoading } = useHealth();
  if (isLoading) return <Badge dot="bg-gray-400" label="Verbinden…" />;
  if (isError || !data) return <Badge dot="bg-red-500" label="Disconnected ❌" />;
  return <Badge dot="bg-green-500" label={`Connected ✅ · ${data.messages ?? 0} msg · ${data.contacts ?? 0} contacten`} />;
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
  const [view, setView] = useState('inbox');
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [selectedContactId, setSelectedContactId] = useState(null);

  const [snoozeModal, setSnoozeModal] = useState({ open: false, message: null });
  const [doneModal, setDoneModal] = useState({ open: false, message: null });
  const [scheduleModal, setScheduleModal] = useState({ open: false, contact: null, message: null });

  const toast = useToast();
  const snoozeMut = useSnoozeMessage();
  const doneMut = useDoneMessage();
  const reopenMut = useReopenMessage();
  const waitingMut = useWaitingMessage();
  const priorityMut = usePriorityMessage();
  const archiveMut = useArchiveMessage();

  // Handlers
  const openMessage = useCallback((m) => setSelectedMessageId(m.id), []);
  const closeMessage = useCallback(() => setSelectedMessageId(null), []);
  const openContact = useCallback((c) => setSelectedContactId(c.id), []);
  const closeContact = useCallback(() => setSelectedContactId(null), []);

  const handleSnooze = (m) => setSnoozeModal({ open: true, message: m });
  const handleDone = (m) => setDoneModal({ open: true, message: m });
  const handleSchedule = (target) => {
    // target kan een message of contact zijn
    const isContact = target && !('channel_id' in target);
    setScheduleModal({ open: true, contact: isContact ? target : null, message: isContact ? null : target });
  };

  const onSnooze = async (snoozedUntilISO, label) => {
    const msg = snoozeModal.message;
    if (!msg) return;
    setSnoozeModal({ open: false, message: null });
    try {
      await snoozeMut.mutateAsync({ id: msg.id, snoozed_until: snoozedUntilISO });
      toast.success(`Komt terug ${label}`, '⏰ Snoozed');
      if (selectedMessageId === msg.id) setSelectedMessageId(null);
    } catch (e) {
      toast.error(e.message, 'Snooze mislukt');
    }
  };

  const onWaiting = async () => {
    const msg = snoozeModal.message;
    if (!msg) return;
    setSnoozeModal({ open: false, message: null });
    try {
      await waitingMut.mutateAsync({ id: msg.id });
      toast.info('Status: wacht op reactie', '⏳ Bewaard');
      if (selectedMessageId === msg.id) setSelectedMessageId(null);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const onDone = async ({ category, note }) => {
    const msg = doneModal.message;
    if (!msg) return;
    setDoneModal({ open: false, message: null });
    try {
      await doneMut.mutateAsync({ id: msg.id, category, note });
      toast.success('Staat in je logboek', '✅ Afgehandeld');
      if (selectedMessageId === msg.id) setSelectedMessageId(null);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const onReopen = async (m) => {
    try {
      await reopenMut.mutateAsync({ id: m.id });
      toast.info('Terug in inbox', '↩ Heropend');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const onArchive = async (m) => {
    try {
      await archiveMut.mutateAsync({ id: m.id });
      toast.info('Naar archief', '🗑️ Gearchiveerd');
      if (selectedMessageId === m.id) setSelectedMessageId(null);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const onUrgent = async (m) => {
    const newPrio = m.priority === 'high' ? 'medium' : 'high';
    try {
      await priorityMut.mutateAsync({ id: m.id, priority: newPrio });
      toast.info(newPrio === 'high' ? 'Gemarkeerd als urgent' : 'Urgent verwijderd', '🔴 Prioriteit');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const onAIPlaceholder = () => {
    toast.info('AI varianten worden gebouwd in stap 11', '🤖 Komt eraan');
  };

  const onScheduleSave = ({ title, date, time, duration, calendar }) => {
    setScheduleModal({ open: false, contact: null, message: null });
    toast.info(`Calendar integratie wordt gebouwd in stap 8 — "${title}" op ${date} ${time} (${duration}min, ${calendar})`, '📅 Genoteerd');
  };

  // Keyboard shortcuts
  const shortcutMap = useMemo(() => {
    const map = {
      Escape: () => {
        if (snoozeModal.open || doneModal.open || scheduleModal.open) return false;
        if (selectedMessageId) { setSelectedMessageId(null); return true; }
        if (selectedContactId) { setSelectedContactId(null); return true; }
        return false;
      },
    };
    for (const item of NAV_ITEMS) {
      if (item.shortcut) {
        map[item.shortcut] = () => { setView(item.id); setSelectedMessageId(null); return true; };
      }
    }
    return map;
  }, [snoozeModal.open, doneModal.open, scheduleModal.open, selectedMessageId, selectedContactId]);

  useKeyboard(shortcutMap);

  // View routing
  const headerTitle = useMemo(() => {
    const item = NAV_ITEMS.find((n) => n.id === view);
    return item ? `${item.icon} ${item.label}` : 'Comm Hub';
  }, [view]);

  const renderMain = () => {
    if (selectedMessageId) {
      return (
        <ConversationView
          messageId={selectedMessageId}
          onBack={closeMessage}
          onSnooze={handleSnooze}
          onDone={handleDone}
          onSchedule={handleSchedule}
          onUrgent={onUrgent}
          onArchive={onArchive}
          onAI={onAIPlaceholder}
        />
      );
    }

    switch (view) {
      case 'inbox':
        return <InboxView onOpenMessage={openMessage} onSnooze={handleSnooze} onDone={handleDone} onSchedule={handleSchedule} selectedId={selectedMessageId} />;
      case 'snoozed':
        return <SnoozedView onOpenMessage={openMessage} onReopen={onReopen} onDone={handleDone} selectedId={selectedMessageId} />;
      case 'logboek':
        return <LogboekView onOpenMessage={openMessage} onReopen={onReopen} selectedId={selectedMessageId} />;
      case 'contacten':
        return <ContactenView onOpenContact={openContact} />;
      case 'verjaardagen':
        return <VerjaardagenView onOpenContact={openContact} onSchedule={handleSchedule} />;
      case 'nudges':
        return <NudgesView onOpenContact={openContact} onSchedule={handleSchedule} />;
      case 'calendar':
        return <CalendarView />;
      case 'projecten':
        return <ProjectenView />;
      case 'analytics':
        return <PlaceholderView title="📊 Analytics" hint="Insights dashboard volgt in een latere stap." />;
      case 'vraag':
        return <PlaceholderView title="💬 Vraag aan AI" hint="Claude chat-interface volgt in stap 11." />;
      case 'instellingen':
        return <InstellingenView />;
      default:
        return <PlaceholderView title="Onbekende view" />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      <Sidebar active={view} onSelect={(id) => { setView(id); setSelectedMessageId(null); }} />

      <main className="flex flex-1 flex-col overflow-hidden">
        {!selectedMessageId ? (
          <header className="flex items-center justify-between border-b border-gray-200 bg-white px-8 py-3">
            <div className="text-sm font-medium text-gray-500">{headerTitle}</div>
            <HealthBadge />
          </header>
        ) : null}

        <section className="flex-1 overflow-hidden">{renderMain()}</section>
      </main>

      {selectedContactId ? (
        <ContactDetail
          contactId={selectedContactId}
          onClose={closeContact}
          onOpenMessage={(m) => { setSelectedContactId(null); setSelectedMessageId(m.id); }}
          onSchedule={(c) => handleSchedule(c)}
        />
      ) : null}

      <SnoozeModal
        open={snoozeModal.open}
        onClose={() => setSnoozeModal({ open: false, message: null })}
        onSnooze={onSnooze}
        onWaiting={onWaiting}
        contactName={snoozeModal.message?.contact_name}
      />

      <DoneModal
        open={doneModal.open}
        onClose={() => setDoneModal({ open: false, message: null })}
        onDone={onDone}
        contactName={doneModal.message?.contact_name}
      />

      <ScheduleModal
        open={scheduleModal.open}
        onClose={() => setScheduleModal({ open: false, contact: null, message: null })}
        onSchedule={onScheduleSave}
        contactName={scheduleModal.contact?.name || scheduleModal.message?.contact_name}
      />
    </div>
  );
}
