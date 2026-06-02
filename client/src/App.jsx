import { useCallback, useMemo, useRef, useState } from 'react';
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
import ScheduleModal from './components/modals/ScheduleModal.jsx';
import ForwardModal from './components/modals/ForwardModal.jsx';
import ComposeModal from './components/modals/ComposeModal.jsx';
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

  // Skip-list: net afgehandelde berichten. Server-side next-in-inbox excludeert deze
  // zodat een race tussen mutation-commit en de next-call nooit terug pingelt naar het
  // zojuist afgehandelde bericht. 30s cleanup is ruim genoeg voor commit-propagatie.
  const handledIdsRef = useRef(new Set());
  // Epoch zodat concurrente advance-calls (snelle 'f f f') niet stale responses toepassen.
  const advanceEpochRef = useRef(0);
  const toastRef = useRef(null);

  const advanceSelection = useCallback(async (currentId) => {
    handledIdsRef.current.add(currentId);
    const epoch = ++advanceEpochRef.current;

    // De database is de waarheid: vraag de server welk bericht nu bovenaan de open inbox staat.
    // Dit vervangt de oude messageOrderRef-aanpak die stale werd zodra InboxView unmounte tijdens
    // ConversationView (geen refetch, dus de lijst kon naar al-afgehandelde berichten teruglopen).
    const exclude = encodeURIComponent([...handledIdsRef.current].join(','));
    let nextId = null;
    try {
      const r = await api.get(`/messages/next-in-inbox?exclude=${exclude}`);
      // Concurrent advance? Negeer dit antwoord — een latere call heeft voorrang.
      if (advanceEpochRef.current !== epoch) return;
      nextId = r.next_id;
    } catch (e) {
      toastRef.current?.error(e.message || 'Volgende bericht ophalen mislukt');
      return;
    }

    if (nextId) {
      setSelectedMessageId(nextId);
    } else {
      setSelectedMessageId(null);
      toastRef.current?.success('Inbox afgewerkt!');
    }

    setTimeout(() => { handledIdsRef.current.delete(currentId); }, 30000);
  }, []);

  const [snoozeModal, setSnoozeModal] = useState({ open: false, message: null, bulkIds: null });
  const [scheduleModal, setScheduleModal] = useState({ open: false, contact: null, message: null });
  const [forwardModal, setForwardModal] = useState({ open: false, message: null });
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeChannel, setComposeChannel] = useState(null);

  const toast = useToast();
  // Houd een ref-pointer naar toast zodat useCallback's (zoals advanceSelection) hem kunnen gebruiken
  // zonder dat de callback bij elke render her-aangemaakt wordt (toast object is niet stabiel).
  toastRef.current = toast;
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
  // Afhandelen is altijd direct: één klik = done + door naar volgende. Geen categorie-keuze.
  // Notitie toevoegen kan later via het logboek als Ramon dat ooit nodig heeft.
  const handleFastDone = async (m) => {
    const id = m.id || m.latest_message_id;
    try {
      await doneMut.mutateAsync({ id, category: 'replied', note: null });
      toast.success('Afgehandeld', null, { action: undoAction([id]) });
      if (selectedMessageId === id) advanceSelection(id);
    } catch (e) {
      toast.error(e.message || 'Afhandelen mislukt');
    }
  };
  // handleDone is identiek aan handleFastDone — geen modal, geen extra keuze.
  const handleDone = handleFastDone;
  const handleBulkSnooze = (ids) => setSnoozeModal({ open: true, message: null, bulkIds: ids });
  const handleBulkDone = async (ids) => {
    if (!ids?.length) return;
    try {
      const r = await bulkDoneMut.mutateAsync({ ids, note: null, category: 'replied' });
      toast.success(`${r.updated} berichten afgehandeld`, 'Afgehandeld', { action: undoAction(ids) });
    } catch (e) {
      toast.error(e.message);
    }
  };
  const handleSchedule = (target) => {
    // target kan een message of contact zijn
    const isContact = target && !('channel_id' in target);
    setScheduleModal({ open: true, contact: isContact ? target : null, message: isContact ? null : target });
  };

  const handleForward = (m) => {
    if (!m || m.channel_type !== 'email') {
      toast.info('Doorsturen is alleen beschikbaar voor email');
      return;
    }
    setForwardModal({ open: true, message: m });
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
        if (selectedMessageId === msg.id) advanceSelection(msg.id);
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
      if (selectedMessageId === msg.id) advanceSelection(msg.id);
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
      if (selectedMessageId === m.id) advanceSelection(m.id);
    } catch (e) {
      toast.error(e.message);
    }
  };

  // Na een reply: gesprek blijft OPEN. Geen advance, geen auto-done — Ramon kan nog
  // een vervolg sturen. Wel een korte toast. De thread-query wordt door useReplyMessage
  // ge-invalidate, dus de zojuist verstuurde reply verschijnt vanzelf in de view.
  const onReplySent = ({ from, channelLabel }) => {
    const sentVia = from || channelLabel || 'het kanaal';
    toast.success(`Verzonden via ${sentVia}`, 'Verstuurd');
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

  const qc = useQueryClient();
  const onBlock = async (m) => {
    const channelType = m.channel_type;
    try {
      if (channelType === 'email' && m.contact_email) {
        const domain = m.contact_email.split('@')[1];
        const useExact = confirm(`Blokkeer alleen ${m.contact_email}?\n\nOK = alleen dit adres\nAnnuleren = hele @${domain} domein`);
        const pattern = useExact ? m.contact_email : (domain ? '@' + domain : m.contact_email);
        const reportSpam = confirm('Ook als spam melden bij Gmail?\n\nOK = naar SPAM-folder in Gmail én lokaal blokkeren\nAnnuleren = alleen lokaal blokkeren');
        if (reportSpam) {
          await api.post(`/messages/${m.id}/report-spam`, { email_pattern: pattern });
          toast.success(`${pattern} gemeld als spam bij Gmail + geblokkeerd`, 'Spam gemeld');
        } else {
          await api.post('/settings/sender-rules', { email_pattern: pattern, rule: 'block' });
          toast.success(`${pattern} geblokkeerd — je ziet nooit meer berichten van dit ${useExact ? 'adres' : 'domein'}`, 'Geblokkeerd');
        }
      } else {
        if (!m.contact_id) {
          toast.warning('Kan deze afzender niet blokkeren (geen contact gekoppeld)');
          return;
        }
        const name = m.contact_name || 'deze afzender';
        const ok = confirm(`Alle open berichten van ${name} archiveren en toekomstige berichten verbergen?`);
        if (!ok) return;

        const contactMsgs = await api.get(`/contacts/${m.contact_id}/messages?status=open`);
        const openIds = (contactMsgs.messages || []).map((msg) => msg.id);
        if (openIds.length) {
          await api.post('/messages/bulk/archive', { ids: openIds });
        }
        if (m.contact_email) {
          await api.post('/settings/sender-rules', { email_pattern: m.contact_email, rule: 'block' });
        }
        toast.success(`${name} geblokkeerd — ${openIds.length} bericht${openIds.length === 1 ? '' : 'en'} gearchiveerd`, 'Geblokkeerd');
      }
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      if (selectedMessageId === m.id) advanceSelection(m.id);
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
        if (snoozeModal.open || scheduleModal.open || forwardModal.open || composeOpen) return false;
        if (selectedMessageId) { setSelectedMessageId(null); return true; }
        if (selectedContactId) { setSelectedContactId(null); return true; }
        return false;
      },
      n: () => {
        if (composeOpen) return false;
        setComposeChannel(null);
        setComposeOpen(true);
        return true;
      },
      t: () => {
        if (composeOpen) return false;
        setComposeChannel('todo');
        setComposeOpen(true);
        return true;
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
      e: () => {
        // Archiveer het geopende bericht
        if (!selectedMessageId) return false;
        onArchive({ id: selectedMessageId });
        return true;
      },
      s: () => {
        // Open snooze-modal voor het geopende bericht
        if (!selectedMessageId) return false;
        handleSnooze({ id: selectedMessageId });
        return true;
      },
      d: () => {
        // Open done-modal voor het geopende bericht
        if (!selectedMessageId) return false;
        handleDone({ id: selectedMessageId });
        return true;
      },
      w: () => {
        // Doorsturen — alleen voor email (channel-check gebeurt in handleForward)
        if (!selectedMessageId) return false;
        const cached = qc.getQueryData(['message', selectedMessageId]);
        if (!cached) return false;
        handleForward(cached);
        return true;
      },
    };
    for (const item of NAV_ITEMS) {
      if (item.shortcut) {
        map[item.shortcut] = () => { setView(item.id); setSelectedMessageId(null); return true; };
      }
    }
    return map;
  }, [cmdkOpen, snoozeModal.open, scheduleModal.open, forwardModal.open, composeOpen, selectedMessageId, selectedContactId]);

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
          onForward={handleForward}
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
            onForward={handleForward}
            onCompose={() => { setComposeChannel(null); setComposeOpen(true); }}
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
        <Sidebar
          active={view}
          onSelect={(id) => { setView(id); setSelectedMessageId(null); }}
          onCompose={() => { setComposeChannel(null); setComposeOpen(true); }}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          <WelcomeScreen onGoToSettings={() => setView('instellingen')} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      <Sidebar
        active={view}
        onSelect={(id) => { setView(id); setSelectedMessageId(null); }}
        onCompose={() => { setComposeChannel(null); setComposeOpen(true); }}
      />

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

      <ScheduleModal
        open={scheduleModal.open}
        onClose={() => setScheduleModal({ open: false, contact: null, message: null })}
        contactName={scheduleModal.contact?.name || scheduleModal.message?.contact_name}
        contactEmail={scheduleModal.contact?.email || scheduleModal.message?.contact_email}
      />

      <ForwardModal
        open={forwardModal.open}
        onClose={() => setForwardModal({ open: false, message: null })}
        message={forwardModal.message}
      />

      <CommandPalette
        open={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        onNavigate={(viewId) => { setView(viewId); setSelectedMessageId(null); }}
        onOpenMessage={(m) => setSelectedMessageId(m.id)}
        onOpenContact={(c) => setSelectedContactId(c.id)}
      />

      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} initialChannel={composeChannel} />
    </div>
  );
}
