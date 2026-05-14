import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Sidebar from './components/layout/Sidebar.jsx';
import InboxView from './components/inbox/InboxView.jsx';
import SnoozedView from './components/snoozed/SnoozedView.jsx';
import LogboekView from './components/logboek/LogboekView.jsx';
import ContactenView from './components/contacts/ContactenView.jsx';
import VerjaardagenView from './components/birthdays/VerjaardagenView.jsx';
import NudgesView from './components/nudges/NudgesView.jsx';
import CalendarView from './components/calendar/CalendarView.jsx';
import SocialPlannerView from './components/social/SocialPlannerView.jsx';
import ProjectenView from './components/projects/ProjectenView.jsx';
import InstellingenView from './components/settings/InstellingenView.jsx';
import PlaceholderView from './components/views/PlaceholderView.jsx';
import ConversationView from './components/conversation/ConversationView.jsx';
import ContactDetail from './components/contacts/ContactDetail.jsx';
import WelcomeScreen from './components/welcome/WelcomeScreen.jsx';
import SnoozeModal from './components/modals/SnoozeModal.jsx';
import DoneModal from './components/modals/DoneModal.jsx';
import ScheduleModal from './components/modals/ScheduleModal.jsx';
import CommandPalette from './components/shared/CommandPalette.jsx';
import { useHealth } from './hooks/useStats.js';
import { useArchiveMessage, useBulkArchive, useBulkDone, useBulkReopen, useBulkSnooze, useDoneMessage, usePinMessage, usePriorityMessage, useReopenMessage, useSnoozeMessage, useUnpinMessage, useWaitingMessage } from './hooks/useMessages.js';
import { useAuthStatus } from './hooks/useChannels.js';
import { useToast } from './hooks/useToast.jsx';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useNotifications } from './hooks/useNotifications.js';
import { api } from './lib/api.js';
import { NAV_ITEMS } from './lib/constants.js';

function HealthBadge() {
  const { data, isError, isLoading } = useHealth();
  if (isLoading) return <Badge dot="bg-gray-400" label="Verbinden…" />;
  if (isError || !data) return <Badge dot="bg-red-500" label="Disconnected" />;
  return <Badge dot="bg-green-500" label={`Connected · ${data.messages ?? 0} msg · ${data.contacts ?? 0} contacten`} />;
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

  const [snoozeModal, setSnoozeModal] = useState({ open: false, message: null, bulkIds: null });
  const [doneModal, setDoneModal] = useState({ open: false, message: null, bulkIds: null });
  const [scheduleModal, setScheduleModal] = useState({ open: false, contact: null, message: null });
  const [cmdkOpen, setCmdkOpen] = useState(false);

  const toast = useToast();
  const snoozeMut = useSnoozeMessage();
  const doneMut = useDoneMessage();
  const reopenMut = useReopenMessage();
  const waitingMut = useWaitingMessage();
  const priorityMut = usePriorityMessage();
  const archiveMut = useArchiveMessage();
  const bulkSnoozeMut = useBulkSnooze();
  const bulkDoneMut = useBulkDone();
  const bulkArchiveMut = useBulkArchive();
  const bulkReopenMut = useBulkReopen();
  const pinMut = usePinMessage();
  const unpinMut = useUnpinMessage();

  const onPin = async (m) => {
    try {
      await pinMut.mutateAsync({ id: m.id });
      toast.success('Vastgezet bovenaan inbox', 'Pinned', {
        action: { label: 'Ongedaan maken', onClick: () => unpinMut.mutateAsync({ id: m.id }).catch(() => {}) },
      });
    } catch (e) { toast.error(e.message); }
  };
  const onUnpin = async (m) => {
    try {
      await unpinMut.mutateAsync({ id: m.id });
      toast.info('Niet meer vastgezet', 'Unpinned');
    } catch (e) { toast.error(e.message); }
  };

  // Undo helper — werkt voor single OR bulk reopen, toont een eigen confirm toast
  const undoAction = (ids) => ({
    label: 'Ongedaan maken',
    onClick: async () => {
      try {
        if (ids.length === 1) {
          await reopenMut.mutateAsync({ id: ids[0] });
          toast.info('Terug in inbox', 'Hersteld');
        } else {
          const r = await bulkReopenMut.mutateAsync({ ids });
          toast.info(`${r.reopened} berichten hersteld`, 'Hersteld');
        }
      } catch (e) {
        toast.error(e.message, 'Ongedaan maken mislukt');
      }
    },
  });

  // Handlers
  const openMessage = useCallback((m) => setSelectedMessageId(m.id), []);
  const closeMessage = useCallback(() => setSelectedMessageId(null), []);
  const openContact = useCallback((c) => setSelectedContactId(c.id), []);
  const closeContact = useCallback(() => setSelectedContactId(null), []);

  const handleSnooze = (m) => setSnoozeModal({ open: true, message: m, bulkIds: null });
  const handleDone = (m) => setDoneModal({ open: true, message: m, bulkIds: null });
  const handleFastDone = async (m) => {
    try {
      await doneMut.mutateAsync({ id: m.id, category: 'replied', note: null });
      toast.success('Afgevinkt', null, { action: undoAction([m.id]) });
      if (selectedMessageId === m.id) setSelectedMessageId(null);
    } catch (e) {
      toast.error(e.message || 'Afvinken mislukt');
    }
  };
  const handleBulkSnooze = (ids) => setSnoozeModal({ open: true, message: null, bulkIds: ids });
  const handleBulkDone = (ids) => setDoneModal({ open: true, message: null, bulkIds: ids });
  const handleSchedule = (target) => {
    // target kan een message of contact zijn
    const isContact = target && !('channel_id' in target);
    setScheduleModal({ open: true, contact: isContact ? target : null, message: isContact ? null : target });
  };

  const onSnooze = async (snoozedUntilISO, label) => {
    const { message: msg, bulkIds } = snoozeModal;
    setSnoozeModal({ open: false, message: null, bulkIds: null });
    try {
      if (bulkIds && bulkIds.length) {
        const r = await bulkSnoozeMut.mutateAsync({ ids: bulkIds, snoozed_until: snoozedUntilISO });
        toast.success(`${r.updated} berichten komen terug ${label}`, 'Snoozed', { action: undoAction(bulkIds) });
      } else if (msg) {
        await snoozeMut.mutateAsync({ id: msg.id, snoozed_until: snoozedUntilISO });
        toast.success(`Komt terug ${label}`, 'Snoozed', { action: undoAction([msg.id]) });
        if (selectedMessageId === msg.id) setSelectedMessageId(null);
      }
    } catch (e) {
      toast.error(e.message, 'Snooze mislukt');
    }
  };

  const onWaiting = async () => {
    const msg = snoozeModal.message;
    if (!msg) return;
    setSnoozeModal({ open: false, message: null, bulkIds: null });
    try {
      await waitingMut.mutateAsync({ id: msg.id });
      toast.info('Status: wacht op reactie', 'Bewaard');
      if (selectedMessageId === msg.id) setSelectedMessageId(null);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const onDone = async ({ category, note }) => {
    const { message: msg, bulkIds } = doneModal;
    setDoneModal({ open: false, message: null, bulkIds: null });
    try {
      if (bulkIds && bulkIds.length) {
        const r = await bulkDoneMut.mutateAsync({ ids: bulkIds, note, category });
        toast.success(`${r.updated} berichten in je logboek`, 'Afgehandeld', { action: undoAction(bulkIds) });
      } else if (msg) {
        await doneMut.mutateAsync({ id: msg.id, category, note });
        toast.success('Staat in je logboek', 'Afgehandeld', { action: undoAction([msg.id]) });
        if (selectedMessageId === msg.id) setSelectedMessageId(null);
      }
    } catch (e) {
      toast.error(e.message);
    }
  };

  const onBulkArchive = async (ids) => {
    if (!ids?.length) return false;
    try {
      const r = await bulkArchiveMut.mutateAsync({ ids });
      toast.info(`${r.archived} berichten naar archief`, 'Gearchiveerd', { action: undoAction(ids) });
      if (selectedMessageId && ids.includes(selectedMessageId)) setSelectedMessageId(null);
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    }
  };

  const onReopen = async (m) => {
    try {
      await reopenMut.mutateAsync({ id: m.id });
      toast.info('Terug in inbox', 'Heropend');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const onArchive = async (m) => {
    try {
      await archiveMut.mutateAsync({ id: m.id });
      toast.info('Naar archief', 'Gearchiveerd', { action: undoAction([m.id]) });
      if (selectedMessageId === m.id) setSelectedMessageId(null);
    } catch (e) {
      toast.error(e.message);
    }
  };

  // Toast na een succesvol verzonden reply. Backend heeft het originele bericht al auto-done gezet —
  // de toast biedt "Houd open" als undo zodat de user het bericht weer in de inbox krijgt.
  const onReplySent = ({ from, channelLabel, originalId, originalDone }) => {
    const sentVia = from || channelLabel || 'het kanaal';
    if (originalDone && originalId) {
      toast.success(`Verzonden via ${sentVia}`, 'Verstuurd · afgehandeld', {
        action: {
          label: 'Houd open',
          onClick: async () => {
            try {
              await reopenMut.mutateAsync({ id: originalId });
              toast.info('Terug in inbox', 'Open gehouden');
            } catch (e) {
              toast.error(e.message || 'Open houden mislukt');
            }
          },
        },
      });
    } else {
      toast.success(`Verzonden via ${sentVia}`, 'Verstuurd');
    }
  };

  const onUrgent = async (m) => {
    const newPrio = m.priority === 'high' ? 'medium' : 'high';
    try {
      await priorityMut.mutateAsync({ id: m.id, priority: newPrio });
      toast.info(newPrio === 'high' ? 'Gemarkeerd als urgent' : 'Urgent verwijderd', 'Prioriteit');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const onAIPlaceholder = () => {
    toast.info('AI varianten worden gebouwd in stap 12 (AI integratie)', 'Komt eraan');
  };
  const onImproveNL = () => toast.info('NL verbeteren wordt gebouwd in stap 12 (AI integratie)', 'Komt eraan');
  const onTranslate = () => toast.info('Vertalen wordt gebouwd in stap 12 (AI integratie)', 'Komt eraan');
  const onFollowUp = () => toast.info('Follow-up wordt gebouwd in stap 12 (AI integratie)', 'Komt eraan');

  const qc = useQueryClient();
  const onBlock = async (m) => {
    if (!m.contact_email) return;
    const domain = m.contact_email.split('@')[1];
    const useDomain = domain && confirm(`Blokkeer alleen ${m.contact_email}?\n\nOK = alleen dit adres\nAnnuleren = hele @${domain} domein`);
    const pattern = useDomain ? m.contact_email : (domain ? '@' + domain : m.contact_email);
    try {
      await api.post('/settings/sender-rules', { email_pattern: pattern, rule: 'block' });
      toast.success(`${pattern} geblokkeerd — je ziet nooit meer berichten van dit ${useDomain ? 'adres' : 'domein'}`, 'Geblokkeerd');
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      if (selectedMessageId === m.id) setSelectedMessageId(null);
    } catch (e) { toast.error(e.message); }
  };

  const onBulkBlock = async (ids, selectedMessages) => {
    if (!ids?.length) return false;
    const emails = [...new Set((selectedMessages || []).map((m) => m.contact_email).filter(Boolean))];
    if (emails.length === 0) {
      toast.warning('Geen email-afzenders in selectie om te blokkeren');
      return false;
    }
    const ok = confirm(`Blokkeer ${emails.length} afzender${emails.length === 1 ? '' : 's'}?\n\n${emails.slice(0, 5).join('\n')}${emails.length > 5 ? `\n…en ${emails.length - 5} meer` : ''}\n\nToekomstige berichten worden automatisch gearchiveerd.`);
    if (!ok) return false;
    try {
      const results = await Promise.allSettled(
        emails.map((email) => api.post('/settings/sender-rules', { email_pattern: email, rule: 'block' })),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      await bulkArchiveMut.mutateAsync({ ids });
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      if (failed) {
        toast.warning(`${emails.length - failed}/${emails.length} afzenders geblokkeerd — ${failed} fout(en)`, 'Deels geblokkeerd');
      } else {
        toast.success(`${emails.length} afzender${emails.length === 1 ? '' : 's'} geblokkeerd + ${ids.length} bericht${ids.length === 1 ? '' : 'en'} gearchiveerd`, 'Geblokkeerd');
      }
      if (selectedMessageId && ids.includes(selectedMessageId)) setSelectedMessageId(null);
      return true;
    } catch (e) { toast.error(e.message); return false; }
  };

  // Auth status — voor welcome screen detectie
  const { data: authStatus, isLoading: authLoading } = useAuthStatus();
  const noAccountsConnected = !authLoading && authStatus
    && (authStatus.accounts || []).every((a) => !a.is_connected);

  // SSE notifications
  useNotifications({ enabled: !noAccountsConnected });


  // Keyboard shortcuts
  const shortcutMap = useMemo(() => {
    const map = {
      Escape: () => {
        if (cmdkOpen) return false; // CommandPalette handles its own Escape
        if (snoozeModal.open || doneModal.open || scheduleModal.open) return false;
        if (selectedMessageId) { setSelectedMessageId(null); return true; }
        if (selectedContactId) { setSelectedContactId(null); return true; }
        return false;
      },
      k: (e) => {
        if (e.metaKey || e.ctrlKey) {
          setCmdkOpen(true);
          return true;
        }
        return false;
      },
      K: (e) => {
        if (e.metaKey || e.ctrlKey) {
          setCmdkOpen(true);
          return true;
        }
        return false;
      },
      r: () => {
        // Focus de reply composer wanneer een conversation geopend is
        if (!selectedMessageId) return false;
        window.dispatchEvent(new Event('focus-reply-composer'));
        return true;
      },
      f: () => {
        // Snel afvinken van het geopende bericht
        if (!selectedMessageId) return false;
        handleFastDone({ id: selectedMessageId });
        return true;
      },
    };
    for (const item of NAV_ITEMS) {
      if (item.shortcut) {
        map[item.shortcut] = () => { setView(item.id); setSelectedMessageId(null); return true; };
      }
    }
    return map;
  }, [cmdkOpen, snoozeModal.open, doneModal.open, scheduleModal.open, selectedMessageId, selectedContactId]);

  useKeyboard(shortcutMap);

  // View routing
  const headerTitle = useMemo(() => {
    const item = NAV_ITEMS.find((n) => n.id === view);
    if (!item) return 'Comm Hub';
    return (
      <span className="inline-flex items-center gap-2">
        <i className={`fa-solid fa-${item.icon}`} />
        {item.label}
      </span>
    );
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
          onImproveNL={onImproveNL}
          onTranslate={onTranslate}
          onFollowUp={onFollowUp}
          onReplySent={onReplySent}
        />
      );
    }

    switch (view) {
      case 'inbox':
        return (
          <InboxView
            onOpenMessage={openMessage}
            onSnooze={handleSnooze}
            onDone={handleDone}
            onFastDone={handleFastDone}
            onSchedule={handleSchedule}
            onOpenContact={openContact}
            onBlock={onBlock}
            onArchive={onArchive}
            onPin={onPin}
            onUnpin={onUnpin}
            onNavigate={(viewId) => { setView(viewId); setSelectedMessageId(null); }}
            onBulkSnooze={handleBulkSnooze}
            onBulkDone={handleBulkDone}
            onBulkArchive={onBulkArchive}
            onBulkBlock={onBulkBlock}
            selectedId={selectedMessageId}
          />
        );
      case 'snoozed':
        return (
          <SnoozedView
            onOpenMessage={openMessage}
            onReopen={onReopen}
            onDone={handleDone}
            onFastDone={handleFastDone}
            onSnooze={handleSnooze}
            onArchive={onArchive}
            onBlock={onBlock}
            onBulkSnooze={handleBulkSnooze}
            onBulkDone={handleBulkDone}
            onBulkArchive={onBulkArchive}
            onBulkBlock={onBulkBlock}
            selectedId={selectedMessageId}
          />
        );
      case 'logboek':
        return <LogboekView onOpenMessage={openMessage} onReopen={onReopen} selectedId={selectedMessageId} />;
      case 'contacten':
        return <ContactenView onOpenContact={openContact} />;
      case 'verjaardagen':
        return <VerjaardagenView onOpenContact={openContact} onSchedule={handleSchedule} />;
      case 'nudges':
        return <NudgesView onOpenContact={openContact} onSchedule={handleSchedule} />;
      case 'calendar':
        return <CalendarView onScheduleNew={() => handleSchedule(null)} />;
      case 'social':
        return <SocialPlannerView />;
      case 'projecten':
        return <ProjectenView />;
      case 'analytics':
        return <PlaceholderView title="Analytics" hint="Insights dashboard volgt in een latere stap." />;
      case 'vraag':
        return <PlaceholderView title="Vraag aan AI" hint="Claude chat-interface volgt in stap 11." />;
      case 'instellingen':
        return <InstellingenView />;
      default:
        return <PlaceholderView title="Onbekende view" />;
    }
  };

  // Welcome screen voor fresh installs (geen accounts verbonden EN op inbox view)
  if (noAccountsConnected && view === 'inbox' && !selectedMessageId) {
    return (
      <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
        <Sidebar active={view} onSelect={(id) => { setView(id); setSelectedMessageId(null); }} />
        <main className="flex flex-1 flex-col overflow-hidden">
          <WelcomeScreen onGoToSettings={() => setView('instellingen')} />
        </main>
      </div>
    );
  }

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
        onClose={() => setSnoozeModal({ open: false, message: null, bulkIds: null })}
        onSnooze={onSnooze}
        onWaiting={snoozeModal.bulkIds ? null : onWaiting}
        contactName={
          snoozeModal.bulkIds
            ? `${snoozeModal.bulkIds.length} bericht${snoozeModal.bulkIds.length === 1 ? '' : 'en'}`
            : snoozeModal.message?.contact_name
        }
      />

      <DoneModal
        open={doneModal.open}
        onClose={() => setDoneModal({ open: false, message: null, bulkIds: null })}
        onDone={onDone}
        contactName={
          doneModal.bulkIds
            ? `${doneModal.bulkIds.length} bericht${doneModal.bulkIds.length === 1 ? '' : 'en'}`
            : doneModal.message?.contact_name
        }
      />

      <ScheduleModal
        open={scheduleModal.open}
        onClose={() => setScheduleModal({ open: false, contact: null, message: null })}
        contactName={scheduleModal.contact?.name || scheduleModal.message?.contact_name}
        contactEmail={scheduleModal.contact?.email || scheduleModal.message?.contact_email}
      />

      <CommandPalette
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        onNavigate={(viewId) => { setView(viewId); setSelectedMessageId(null); }}
        onOpenMessage={(m) => setSelectedMessageId(m.id)}
        onOpenContact={(c) => setSelectedContactId(c.id)}
      />
    </div>
  );
}
