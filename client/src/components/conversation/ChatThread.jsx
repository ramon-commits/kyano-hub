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

function linkifyText(text) {
  if (!text) return [text];
  const regex = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/g;
  const result = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) result.push(text.slice(lastIndex, match.index));
    const url = match[0];
    const href = url.startsWith('www.') ? 'https://' + url : url;
    result.push(
      <a
        key={`${match.index}-${url}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline hover:text-blue-800 break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {url.length > 50 ? url.slice(0, 47) + '...' : url}
      </a>,
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) result.push(text.slice(lastIndex));
  return result;
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
                        ? 'rounded-2xl rounded-tr-sm px-2 py-2 shadow-sm'
                        : 'rounded-2xl rounded-tl-sm bg-white px-2 py-2 shadow-sm'
                    }
                    style={
                      isOutbound
                        ? { background: '#d9fdd3', color: '#111827' }
                        : undefined
                    }
                  >
                    <MediaContent attachments={m.attachments_json} />
                    {(m.body_text || stripSenderPrefix(m.snippet)) ? (
                      <div className="whitespace-pre-wrap break-words px-1 text-[14px] leading-snug">
                        {linkifyText(m.body_text || stripSenderPrefix(m.snippet))}
                      </div>
                    ) : (!m.attachments_json) ? (
                      <div className="whitespace-pre-wrap break-words px-1 text-[14px] leading-snug text-gray-400">
                        (leeg)
                      </div>
                    ) : null}
                    <div className="mt-1 px-1 text-right text-[10px] text-gray-500">
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

function parseAttachments(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input !== 'string') return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatBytes(n) {
  if (!n || typeof n !== 'number') return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function MediaContent({ attachments }) {
  const items = parseAttachments(attachments);
  if (!items.length) return null;
  return (
    <div className="mb-1 space-y-1">
      {items.map((att, i) => {
        const url = att.url || att.download_url || null;
        const mime = att.mime || att.mime_type || att.type || '';
        const filename = att.filename || att.file_name || att.name || null;
        const kind = att.kind
          || (mime.startsWith?.('image/') ? 'image'
            : mime.startsWith?.('video/') ? 'video'
            : mime.startsWith?.('audio/') ? 'audio'
            : (filename && /\.(jpe?g|png|gif|webp)$/i.test(filename)) ? 'image'
            : (filename && /\.(mp4|mov|webm)$/i.test(filename)) ? 'video'
            : 'file');

        if (kind === 'image' && url) {
          return (
            <a
              key={att.id || i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="block"
            >
              <img
                src={url}
                alt={filename || 'Foto'}
                loading="lazy"
                className="max-h-80 max-w-[280px] cursor-pointer rounded-lg object-cover transition-opacity hover:opacity-90"
              />
            </a>
          );
        }
        if (kind === 'video' && url) {
          return (
            <video
              key={att.id || i}
              src={url}
              controls
              preload="metadata"
              className="max-h-80 max-w-[280px] rounded-lg bg-black"
            />
          );
        }
        if (kind === 'audio' && url) {
          return (
            <audio
              key={att.id || i}
              src={url}
              controls
              className="w-[280px]"
            />
          );
        }
        // file (PDF, doc, anders) of ontbrekende URL
        const sizeLabel = formatBytes(att.size || att.file_size);
        return url ? (
          <a
            key={att.id || i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex max-w-[280px] items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-blue-600 transition-colors hover:bg-gray-200"
          >
            <i className="fa-solid fa-file shrink-0" />
            <span className="min-w-0 flex-1 truncate">{filename || 'Bijlage'}</span>
            {sizeLabel ? <span className="shrink-0 text-xs text-gray-500">{sizeLabel}</span> : null}
          </a>
        ) : (
          <div
            key={att.id || i}
            className="flex max-w-[280px] items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500"
            title="Geen download-URL beschikbaar"
          >
            <i className="fa-solid fa-paperclip shrink-0" />
            <span className="min-w-0 flex-1 truncate">{filename || `${kind} (geen URL)`}</span>
          </div>
        );
      })}
    </div>
  );
}

// Snippet kan in groep chats geprefixeerd zijn met "Sender: tekst"; strip dat voor bubbel weergave
function stripSenderPrefix(snippet) {
  if (!snippet) return '';
  const m = snippet.match(/^([^:]+):\s(.+)$/);
  return m ? m[2] : snippet;
}
