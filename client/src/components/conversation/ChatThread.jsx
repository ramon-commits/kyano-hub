import { useEffect, useMemo, useRef } from 'react';
import { formatTime, parseDateSafe, isSameDay, formatDateShort } from '../../lib/utils.js';
import ChannelBadge from '../shared/ChannelBadge.jsx';

const SENDER_PALETTE = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

function hashStr(str) {
  if (!str) return 0;
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function colorForSender(name) {
  if (!name) return '#6b7280';
  return SENDER_PALETTE[hashStr(name) % SENDER_PALETTE.length];
}

function senderNameOf(m) {
  // subject werd door unipile-sync gevuld met sender naam (per bericht)
  if (m.direction === 'outbound') return 'Jij';
  return m.subject || m.contact_name || 'Onbekend';
}

export default function ChatThread({ message, threadMessages }) {
  const items = threadMessages?.length ? threadMessages : [message];
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [items.length]);

  // Detecteer of dit een group chat is op basis van unieke sender-namen
  const isGroup = useMemo(() => {
    const senders = new Set();
    for (const m of items) {
      const s = senderNameOf(m);
      if (m.direction === 'inbound' && s) senders.add(s);
    }
    return senders.size >= 2;
  }, [items]);

  let lastDate = null;
  let lastSender = null;

  return (
    <div className="flex h-full flex-col" style={{ background: '#efeae2' }}>
      <div className="border-b border-gray-200 bg-white px-8 py-3 text-center">
        <ChannelBadge type={message.channel_type} label={message.channel_label} />
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-6 py-5 scrollbar-thin">
        {items.map((m, i) => {
          const d = parseDateSafe(m.received_at);
          const showDate = !lastDate || !isSameDay(d, lastDate);
          const isOutbound = m.direction === 'outbound';
          const sender = senderNameOf(m);
          // Sender naam tonen: alleen in group chats, voor inbound, en NIET als zelfde sender als vorig bericht (binnen dezelfde dag)
          const showSender = isGroup && !isOutbound && (sender !== lastSender || showDate);

          lastDate = d;
          lastSender = sender;

          const senderColor = colorForSender(sender);

          return (
            <div key={m.id || i}>
              {showDate ? (
                <div className="my-4 flex justify-center">
                  <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-gray-600 shadow-sm">
                    {isSameDay(d, new Date()) ? 'Vandaag' : formatDateShort(d)}
                  </span>
                </div>
              ) : null}

              <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[75%]">
                  {showSender ? (
                    <div
                      className="mb-0.5 pl-3 text-[11px] font-semibold leading-none"
                      style={{ color: senderColor }}
                    >
                      {sender}
                    </div>
                  ) : null}
                  <div
                    className={
                      isOutbound
                        ? 'rounded-2xl rounded-tr-sm px-3 py-2 shadow-sm'
                        : 'rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm'
                    }
                    style={
                      isOutbound
                        ? { background: '#d9fdd3', color: '#111827' }
                        : undefined
                    }
                  >
                    <div className="whitespace-pre-wrap break-words text-[14px] leading-snug">
                      {/* Snippet kan "Sender: tekst" zijn als dat zo gestored is — gebruik body_text als bron-of-truth */}
                      {m.body_text || stripSenderPrefix(m.snippet) || '(leeg)'}
                    </div>
                    <div className="mt-1 text-right text-[10px] text-gray-500">
                      {formatTime(d)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// Snippet kan in groep chats geprefixeerd zijn met "Sender: tekst"; strip dat voor bubbel weergave
function stripSenderPrefix(snippet) {
  if (!snippet) return '';
  const m = snippet.match(/^([^:]+):\s(.+)$/);
  return m ? m[2] : snippet;
}
