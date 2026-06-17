import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMessage, useThread, useReplyMessage, useReplyWithMedia, useReplyEmailWithAttachments } from '../../hooks/useMessages.js';
import EmailThread from './EmailThread.jsx';
import ChatThread from './ChatThread.jsx';
import ReplyComposer from './ReplyComposer.jsx';
import ThreadStatusBar from './ThreadStatusBar.jsx';
import ThreadSummaryPanel from './ThreadSummaryPanel.jsx';
import ThreadAiSummaryCard from './ThreadAiSummaryCard.jsx';
import CreateTodoModal from '../modals/CreateTodoModal.jsx';
import ScheduleFollowUpModal from '../modals/ScheduleFollowUpModal.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import ChannelBadge from '../shared/ChannelBadge.jsx';
import PriorityBadge from '../shared/PriorityBadge.jsx';
import Avatar from '../shared/Avatar.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { api } from '../../lib/api.js';

export default function ConversationView({
  messageId,
  onBack,
  onSnooze,
  onDone,
  onSchedule,
  onUrgent,
  onArchive,
  onForward,
  onReplySent,
  onSpamBlock,
  onAdvance,
}) {
  const { data: m, isLoading, isError, error, refetch } = useMessage(messageId);
  const { data: thread } = useThread(messageId);
  const replyMut = useReplyMessage();
  const replyMediaMut = useReplyWithMedia();
  const replyEmailAttachMut = useReplyEmailWithAttachments();
  const toast = useToast();
  const qc = useQueryClient();
  const [showSummary, setShowSummary] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [showTodoModal, setShowTodoModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [todoSubmitting, setTodoSubmitting] = useState(false);
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false);
  const downloadRef = useRef(null);

  // Sluit het download-menu bij klik buiten of Escape
  useEffect(() => {
    if (!showDownload) return undefined;
    function onDown(e) {
      if (downloadRef.current && !downloadRef.current.contains(e.target)) setShowDownload(false);
    }
    function onKey(e) { if (e.key === 'Escape') setShowDownload(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showDownload]);

  const downloadThread = (format) => {
    window.open(`/api/messages/${messageId}/thread-download?format=${format}`, '_blank');
    setShowDownload(false);
  };

  // Best-effort: markeer extern als gelezen zodra een conversatie geopend wordt
  // (laat het rode nummertje in WhatsApp / Gmail verdwijnen)
  useEffect(() => {
    if (!messageId) return;
    api.post(`/messages/${messageId}/mark-read`).catch(() => { /* silent */ });
  }, [messageId]);

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="p-8 text-center">
          <p className="font-medium text-red-600">Kon bericht niet laden</p>
          <p className="mt-1 text-sm text-gray-500">{error?.message || 'Onbekende fout'}</p>
          <button
            onClick={() => refetch()}
            className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
          >
            Opnieuw proberen
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !m) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner label="Bericht laden…" />
      </div>
    );
  }

  const isEmail = m.channel_type === 'email';
  const threadMessages = thread?.messages || [m];

  // Voor chat threads: tel unieke inbound senders → groepschat als >= 2
  const isChat = m.channel_type === 'whatsapp' || m.channel_type === 'linkedin' || m.channel_type === 'instagram';
  const uniqueInboundSenders = new Set();
  for (const tm of threadMessages) {
    if (tm.direction === 'inbound' && tm.subject) uniqueInboundSenders.add(tm.subject);
  }
  const isGroupChat = isChat && uniqueInboundSenders.size >= 2;
  const participantCount = isGroupChat ? uniqueInboundSenders.size + 1 : 0; // +1 voor Ramon

  const handleSend = async ({ text, cc, bcc }) => {
    try {
      const result = await replyMut.mutateAsync({
        id: messageId,
        body_text: text,
        cc: cc || null,
        bcc: bcc || null,
      });
      if (onReplySent) {
        onReplySent({
          from: result.from,
          channelLabel: m.channel_account || m.channel_label,
          originalId: result.original_id || messageId,
          originalDone: !!result.original_done,
        });
      } else {
        toast.success(`Verzonden via ${result.from || m.channel_account || m.channel_label}`, 'Verstuurd');
      }
      return true;
    } catch (e) {
      if (e.status === 401 || e.data?.needs_reconnect) {
        toast.error('Account moet opnieuw verbonden worden (token verlopen)', 'Herconnectie nodig');
      } else if (e.status === 400) {
        toast.error(e.message);
      } else {
        toast.error(e.message || 'Verzenden mislukt');
      }
      return false;
    }
  };

  const handleSendMedia = async ({ text, files, cc, bcc }) => {
    if (!files?.length) return false;
    try {
      const result = m.channel_type === 'email'
        ? await replyEmailAttachMut.mutateAsync({ id: messageId, text, cc, bcc, files })
        : await replyMediaMut.mutateAsync({ id: messageId, text, files });
      if (onReplySent) {
        onReplySent({
          from: m.channel_account || m.channel_label,
          channelLabel: m.channel_account || m.channel_label,
          originalId: result.original_id || messageId,
          originalDone: !!result.original_done,
        });
      } else {
        toast.success(`${files.length} bestand${files.length === 1 ? '' : 'en'} verzonden`, 'Verstuurd');
      }
      return true;
    } catch (e) {
      if (e.status === 413) toast.error(e.message || 'Bestand te groot');
      else if (e.status === 400) toast.error(e.message || 'Verzenden mislukt');
      else toast.error(e.message || 'Media verzenden mislukt');
      return false;
    }
  };

  const handleCopy = (ok) => {
    if (ok) toast.success('Tekst staat op je klembord', 'Gekopieerd');
    else toast.error('Kon niet kopiëren');
  };

  // Trigger vanuit ThreadStatusBar / banner: genereer + zet direct in textarea via window event
  const handleFollowUpFromStatus = async () => {
    try {
      const r = await api.post('/ai/follow-up', { message_id: messageId });
      if (!r.follow_up) {
        toast.error('Geen follow-up tekst ontvangen');
        return null;
      }
      toast.success(
        r.is_ai ? 'Follow-up gegenereerd met AI' : 'Follow-up template geladen (AI niet beschikbaar)',
        'Follow-up klaar',
      );
      window.dispatchEvent(new CustomEvent('reply-composer-set-text', { detail: r.follow_up }));
      return { text: r.follow_up };
    } catch (e) {
      toast.error(e.message || 'Follow-up genereren mislukt');
      return null;
    }
  };

  // Bepaal of het laatste bericht in de thread outbound is (= jij wacht op antwoord)
  const lastThreadMsg = threadMessages[threadMessages.length - 1];
  const showFollowUp = !!(lastThreadMsg && lastThreadMsg.direction === 'outbound');

  // Pre-fill voor de to-do modal — zelfde format als de backend default.
  const defaultTodoTitle = `Opvolgen: ${m.contact_name || 'contact'} - ${m.subject || (m.snippet || '').slice(0, 50)}`;

  const handleCreateTodo = async ({ title, due_date }) => {
    setTodoSubmitting(true);
    try {
      const r = await api.post(`/messages/${messageId}/create-todo`, { title, due_date });
      toast.success('To-do gemaakt', 'Gelukt');
      setShowTodoModal(false);
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      return r;
    } catch (e) {
      toast.error(e.message || 'To-do maken mislukt');
      return null;
    } finally {
      setTodoSubmitting(false);
    }
  };

  const handleScheduleFollowUp = async ({ days, mode, custom_text }) => {
    setFollowUpSubmitting(true);
    try {
      const r = await api.post(`/messages/${messageId}/schedule-follow-up`, { days, mode, custom_text });
      toast.success('Follow-up gepland', 'Gepland');
      setShowFollowUpModal(false);
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      if (onAdvance) onAdvance(messageId);
      return r;
    } catch (e) {
      toast.error(e.message || 'Follow-up plannen mislukt');
      return null;
    } finally {
      setFollowUpSubmitting(false);
    }
  };

  const handleSpamAndBlock = () => {
    if (onSpamBlock) onSpamBlock(m);
  };

  // Een door de cron klaargezette follow-up: laad de voorbereide tekst in de composer.
  // Valt terug op live-genereren als er (nog) geen draft is.
  const followUpReady = m.done_note === 'Follow-up klaar — verstuur';
  const loadPreparedFollowUp = () => {
    if (m.follow_up_custom_text) {
      window.dispatchEvent(new CustomEvent('reply-composer-set-text', { detail: m.follow_up_custom_text }));
      toast.success('Follow-up staat klaar in het antwoordveld', 'Klaar om te versturen');
    } else {
      handleFollowUpFromStatus();
    }
  };

  return (
    <div className="flex h-full bg-gray-50">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4">
          <button
            onClick={onBack}
            className="grid h-9 w-9 place-items-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            title="Terug naar inbox"
          >
            ←
          </button>
          <Avatar name={m.contact_name} initials={m.contact_initials} color={m.contact_color} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-gray-900">
                {isEmail && m.subject
                  ? m.subject
                  : (m.contact_name || m.channel_account || 'Onbekend')}
              </h2>
              <ChannelBadge type={m.channel_type} label={m.channel_label} size="xs" />
              {m.priority === 'high' ? <PriorityBadge priority="high" size="xs" /> : null}
              {threadMessages.length > 1 ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                  {threadMessages.length} berichten
                </span>
              ) : null}
            </div>
            {isEmail && m.subject ? (
              <div className="mt-0.5 truncate text-sm text-gray-600">
                {m.contact_name || m.channel_account}
                {m.contact_email ? <span className="ml-1 text-gray-400">· {m.contact_email}</span> : null}
              </div>
            ) : isGroupChat ? (
              <div className="mt-0.5 truncate text-xs text-gray-500">
                <i className="fa-solid fa-users mr-1" />Groepschat · {participantCount} deelnemers
              </div>
            ) : (m.contact_company || m.contact_email || m.contact_phone) ? (
              <div className="mt-0.5 truncate text-xs text-gray-500">
                {[m.contact_company, m.contact_email, m.contact_phone].filter(Boolean).join(' · ')}
              </div>
            ) : null}
          </div>
          <div className="relative shrink-0" ref={downloadRef}>
            <button
              onClick={() => setShowDownload((v) => !v)}
              title="Download thread"
              aria-label="Download thread"
              className={`grid h-9 w-9 place-items-center rounded-md transition-colors ${
                showDownload ? 'bg-blue-50 text-blue-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              <i className="fa-solid fa-download" />
            </button>
            {showDownload ? (
              <div className="absolute right-0 z-50 mt-1 min-w-[220px] rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                <button
                  onClick={() => downloadThread('txt')}
                  className="block w-full rounded px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <i className="fa-solid fa-file-lines mr-2 text-gray-400" />Download als tekst (.txt)
                </button>
                <button
                  onClick={() => downloadThread('html')}
                  className="block w-full rounded px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <i className="fa-solid fa-file-code mr-2 text-gray-400" />Download als HTML
                </button>
              </div>
            ) : null}
          </div>
          <button
            onClick={() => setShowSummary((v) => !v)}
            title={showSummary ? 'Verberg thread info' : 'Toon thread info'}
            aria-label="Thread info"
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors ${
              showSummary
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            <i className="fa-solid fa-circle-info" />
          </button>
        </header>

        {/* AI thread-samenvatting (alleen email) */}
        {isEmail ? <ThreadAiSummaryCard messageId={messageId} /> : null}

        {/* Follow-up klaargezet door de cron (slimme follow-up) — laad de voorbereide tekst */}
        {followUpReady ? (
          <div className="mx-4 mt-2 flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-purple-800">
              <i className="fa-solid fa-clock-rotate-left" />
              <span>Follow-up klaar — geen reactie ontvangen. Verstuur je geplande follow-up.</span>
            </div>
            <button
              onClick={loadPreparedFollowUp}
              className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-700"
            >
              <i className="fa-solid fa-paper-plane mr-1.5" />Verstuur follow-up
            </button>
          </div>
        ) : m.priority === 'high' && m.done_note && /follow-up/i.test(m.done_note) ? (
          <div className="mx-4 mt-2 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-orange-800">
              <i className="fa-solid fa-bell" />
              <span>Geen reactie ontvangen. Wil je een follow-up sturen?</span>
            </div>
            <button
              onClick={handleFollowUpFromStatus}
              className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-orange-700"
            >
              <i className="fa-solid fa-wand-magic-sparkles mr-1.5" />Genereer follow-up
            </button>
          </div>
        ) : null}

        {/* Thread body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isEmail ? <EmailThread message={m} threadMessages={threadMessages} /> : <ChatThread message={m} threadMessages={threadMessages} />}
        </div>

        <ReplyComposer
          messageId={messageId}
          channelType={m.channel_type}
          defaultAccount={m.channel_account}
          sending={replyMut.isPending || replyMediaMut.isPending || replyEmailAttachMut.isPending}
          onSend={handleSend}
          onSendMedia={handleSendMedia}
          onCopy={handleCopy}
        />

        <ThreadStatusBar
          onSnooze={() => onSnooze?.(m)}
          onDone={() => onDone?.(m)}
          onSchedule={() => onSchedule?.(m)}
          onUrgent={() => onUrgent?.(m)}
          onArchive={() => onArchive?.(m)}
          onForward={isEmail && onForward ? () => onForward(m) : null}
          onFollowUp={handleFollowUpFromStatus}
          showFollowUp={showFollowUp}
          currentPriority={m.priority}
          onPlanFollowUp={() => setShowFollowUpModal(true)}
          onCreateTodo={() => setShowTodoModal(true)}
          onSpamBlock={onSpamBlock ? handleSpamAndBlock : null}
          isEmail={isEmail}
        />
      </div>

      {showSummary ? (
        <ThreadSummaryPanel messageId={messageId} onClose={() => setShowSummary(false)} />
      ) : null}

      <CreateTodoModal
        open={showTodoModal}
        onClose={() => setShowTodoModal(false)}
        defaultTitle={defaultTodoTitle}
        onSubmit={handleCreateTodo}
        submitting={todoSubmitting}
      />
      <ScheduleFollowUpModal
        open={showFollowUpModal}
        onClose={() => setShowFollowUpModal(false)}
        onSubmit={handleScheduleFollowUp}
        submitting={followUpSubmitting}
      />
    </div>
  );
}
