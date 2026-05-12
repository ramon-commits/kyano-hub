import { useEffect, useRef } from 'react';
import { formatTime, parseDateSafe, isSameDay, formatDateShort } from '../../lib/utils.js';
import ChannelBadge from '../shared/ChannelBadge.jsx';

export default function ChatThread({ message, threadMessages }) {
  const items = threadMessages?.length ? threadMessages : [message];
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [items.length]);

  // Group by day for date dividers
  let lastDate = null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white px-8 py-3 text-center">
        <ChannelBadge type={message.channel_type} label={message.channel_label} />
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-8 py-6 scrollbar-thin">
        {items.map((m, i) => {
          const d = parseDateSafe(m.received_at);
          const showDate = !lastDate || !isSameDay(d, lastDate);
          lastDate = d;
          const isOutbound = m.direction === 'outbound';
          const time = formatTime(d);
          return (
            <div key={m.id || i}>
              {showDate ? (
                <div className="my-3 text-center text-[11px] font-medium uppercase tracking-wider text-gray-400">
                  {isSameDay(d, new Date()) ? 'Vandaag' : formatDateShort(d)}
                </div>
              ) : null}
              <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ring-1 ${
                    isOutbound
                      ? 'rounded-tr-md bg-blue-600 text-white ring-blue-700'
                      : 'rounded-tl-md bg-white text-gray-800 ring-gray-200'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {m.body_text || m.snippet || '(leeg)'}
                  </div>
                  <div className={`mt-1 text-[10px] ${isOutbound ? 'text-blue-100' : 'text-gray-400'}`}>
                    {time}
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
