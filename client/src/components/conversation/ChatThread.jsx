import { useEffect, useRef } from 'react';
import { formatTime, parseDateSafe } from '../../lib/utils.js';
import ChannelBadge from '../shared/ChannelBadge.jsx';

export default function ChatThread({ message }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [message?.id]);

  const m = message;
  const time = formatTime(parseDateSafe(m.received_at));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white px-8 py-4 text-center">
        <ChannelBadge type={m.channel_type} label={m.channel_label} />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-8 py-6 scrollbar-thin">
        <div className="text-center text-[11px] font-medium uppercase tracking-wider text-gray-400">
          Vandaag
        </div>

        <div className="flex justify-start">
          <div className="max-w-[70%] rounded-2xl rounded-tl-md bg-white px-4 py-2.5 shadow-sm ring-1 ring-gray-200">
            <div className="text-sm leading-relaxed text-gray-800">{m.snippet}</div>
            <div className="mt-1 text-[10px] text-gray-400">{time}</div>
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500">
          Volledige chat-historie wordt geladen na WhatsApp koppeling (stap 9).
        </div>

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
