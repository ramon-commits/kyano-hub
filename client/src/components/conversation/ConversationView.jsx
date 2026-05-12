import { useMessage } from '../../hooks/useMessages.js';
import EmailThread from './EmailThread.jsx';
import ChatThread from './ChatThread.jsx';
import ReplyComposer from './ReplyComposer.jsx';
import ThreadStatusBar from './ThreadStatusBar.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import ChannelBadge from '../shared/ChannelBadge.jsx';
import PriorityBadge from '../shared/PriorityBadge.jsx';
import Avatar from '../shared/Avatar.jsx';

export default function ConversationView({
  messageId,
  onBack,
  onSnooze,
  onDone,
  onSchedule,
  onUrgent,
  onArchive,
  onSend,
  onCopy,
  onAI,
}) {
  const { data: m, isLoading } = useMessage(messageId);

  if (isLoading || !m) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner label="Bericht laden…" />
      </div>
    );
  }

  const isEmail = m.channel_type === 'email';

  return (
    <div className="flex h-full flex-col bg-white">
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
              {m.contact_name || m.channel_account || 'Onbekend'}
            </h2>
            <ChannelBadge type={m.channel_type} label={m.channel_label} size="xs" />
            {m.priority === 'high' ? <PriorityBadge priority="high" size="xs" /> : null}
          </div>
          {isEmail && m.subject ? (
            <div className="mt-0.5 truncate text-sm text-gray-600">{m.subject}</div>
          ) : null}
          {m.contact_company || m.contact_email ? (
            <div className="mt-0.5 truncate text-xs text-gray-500">
              {[m.contact_company, m.contact_email].filter(Boolean).join(' · ')}
            </div>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-gray-50 scrollbar-thin">
        {isEmail ? <EmailThread message={m} /> : <ChatThread message={m} />}
      </div>

      <ReplyComposer
        channelType={m.channel_type}
        defaultAccount={m.channel_account}
        onSend={(payload) => onSend?.(m, payload)}
        onCopy={(ok) => onCopy?.(ok)}
        onAI={() => onAI?.(m)}
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
