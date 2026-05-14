import { useMessage, useThread, useReplyMessage } from '../../hooks/useMessages.js';
import EmailThread from './EmailThread.jsx';
import ChatThread from './ChatThread.jsx';
import ReplyComposer from './ReplyComposer.jsx';
import ThreadStatusBar from './ThreadStatusBar.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import ChannelBadge from '../shared/ChannelBadge.jsx';
import PriorityBadge from '../shared/PriorityBadge.jsx';
import Avatar from '../shared/Avatar.jsx';
import { useToast } from '../../hooks/useToast.jsx';

export default function ConversationView({
  messageId,
  onBack,
  onSnooze,
  onDone,
  onSchedule,
  onUrgent,
  onArchive,
  onAI,
  onImproveNL,
  onTranslate,
  onFollowUp,
  onReplySent,
}) {
  const { data: m, isLoading } = useMessage(messageId);
  const { data: thread } = useThread(messageId);
  const replyMut = useReplyMessage();
  const toast = useToast();

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

  const handleCopy = (ok) => {
    if (ok) toast.success('Tekst staat op je klembord', 'Gekopieerd');
    else toast.error('Kon niet kopiëren');
  };

  return (
    <div className="flex h-full flex-col bg-gray-50">
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
      </header>

      {/* Thread body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isEmail ? <EmailThread message={m} threadMessages={threadMessages} /> : <ChatThread message={m} threadMessages={threadMessages} />}
      </div>

      <ReplyComposer
        channelType={m.channel_type}
        defaultAccount={m.channel_account}
        sending={replyMut.isPending}
        onSend={handleSend}
        onCopy={handleCopy}
        onAI={() => onAI?.(m)}
        onImproveNL={() => onImproveNL?.(m)}
        onTranslate={() => onTranslate?.(m)}
        onFollowUp={() => onFollowUp?.(m)}
      />

      <ThreadStatusBar
        onSnooze={() => onSnooze?.(m)}
        onDone={() => onDone?.(m)}
        onSchedule={() => onSchedule?.(m)}
        onUrgent={() => onUrgent?.(m)}
        onArchive={() => onArchive?.(m)}
        currentPriority={m.priority}
      />
    </div>
  );
}
