import { useState } from 'react';
import Avatar from '../shared/Avatar.jsx';
import ChannelBadge from '../shared/ChannelBadge.jsx';
import PriorityBadge from '../shared/PriorityBadge.jsx';
import Badge from '../shared/Badge.jsx';
import { cn, timeAgo, formatDateShort, formatTime, parseDateSafe } from '../../lib/utils.js';

export default function MessageRow({ message, selected, onClick, onSnooze, onDone, onFastDone, onSchedule, onReopen, onArchive, onBlock, onMarkSpam, onPin, onUnpin, onForward, onAsanaAction, isPinned, showWakeUp, showDoneInfo, selectable, isSelected, onToggleSelect }) {
  const m = message;
  const isEmail = m.channel_type === 'email';
  const isTodo = m.channel_type === 'todo';
  const isAsana = m.channel_id === 'asana-1';
  // Uitklapbare Asana-taak: alleen als er iets te tonen valt (email of telefoon).
  const isAsanaTask = isAsana && (m.asana_contact_email || m.asana_contact_phone);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
    <div
      onClick={onClick}
      className={cn(
        'group flex cursor-pointer items-center gap-4 px-5 py-[14px] transition-colors',
        isSelected ? 'bg-blue-50' : selected ? 'bg-blue-50/60' : 'hover:bg-gray-50',
      )}
    >
      {selectable ? (
        <input
          type="checkbox"
          checked={!!isSelected}
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(m.id, e); }}
          onChange={() => { /* handled via onClick to capture shift key */ }}
          className="h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500/30"
          aria-label={`Selecteer bericht van ${m.contact_name || 'onbekend'}`}
        />
      ) : null}

      {isAsana ? (
        <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-rose-100">
          <i className="fa-solid fa-diagram-project text-lg text-rose-600" />
        </div>
      ) : isTodo ? (
        <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-purple-100">
          <i className="fa-solid fa-circle-check text-lg text-purple-600" />
        </div>
      ) : (
        <Avatar
          name={m.contact_name}
          initials={m.contact_initials}
          color={m.contact_color}
          size="md"
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-gray-900">
            {isTodo ? (m.subject || 'To-do') : (m.contact_name || m.channel_account || 'Onbekend')}
          </span>
          {m.message_count > 1 ? (
            <span
              className="shrink-0 rounded-full bg-gray-100 px-1.5 py-px text-[11px] font-semibold leading-snug text-gray-600"
              title={`${m.message_count} berichten in deze conversatie`}
            >
              {m.message_count}
            </span>
          ) : null}
          {isAsana ? (
            <Badge color="#be123c" bg="#ffe4e6" size="xs"><i className="fa-brands fa-asana mr-1" />Asana</Badge>
          ) : (
            <ChannelBadge type={m.channel_type} label={m.channel_label} size="xs" showLabel={false} />
          )}
          {m.priority === 'high' ? <PriorityBadge priority="high" size="xs" /> : null}
          {m.status === 'waiting' ? (
            <Badge color="#a16207" bg="#fef3c7" size="xs"><i className="fa-solid fa-hourglass-half mr-1" />Wacht op reactie</Badge>
          ) : null}
          {m.priority === 'high' && m.done_note && /follow-up/i.test(m.done_note) ? (
            <Badge color="#c2410c" bg="#ffedd5" size="xs"><i className="fa-solid fa-bell mr-1" />Follow-up nodig</Badge>
          ) : null}
        </div>

        <div className="mt-0.5 flex items-baseline gap-1.5 text-[13px]">
          {isEmail && m.subject ? (
            <span className="truncate font-medium text-gray-800">{m.subject}</span>
          ) : null}
          {m.is_placeholder ? (
            <span className="truncate italic text-gray-400">Klik om je eerste bericht te typen…</span>
          ) : (
            <span className="truncate text-gray-500">
              {isEmail && m.subject ? '— ' : ''}{m.snippet}
            </span>
          )}
        </div>

        {showWakeUp && m.snoozed_until ? (
          <div className="mt-1 text-[11px] text-orange-700">
            <i className="fa-solid fa-clock mr-1" />Komt terug: <strong>{formatDateShort(parseDateSafe(m.snoozed_until))} {formatTime(parseDateSafe(m.snoozed_until))}</strong>
          </div>
        ) : null}

        {showDoneInfo && m.done_at ? (
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <Badge color="#16a34a" bg="#dcfce7" size="xs"><i className="fa-solid fa-circle-check mr-1" />{m.done_category || 'afgehandeld'}</Badge>
            {m.done_note ? <span className="italic text-gray-600">&ldquo;{m.done_note}&rdquo;</span> : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isAsanaTask && !expanded ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
            className="flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
          >
            Bekijk <i className="fa-solid fa-chevron-down text-[10px]" />
          </button>
        ) : null}
        {isPinned ? (
          <button
            onClick={(e) => { e.stopPropagation(); onUnpin?.(m); }}
            title="Niet meer vastzetten"
            className="grid h-7 w-7 place-items-center rounded-md text-amber-500 transition-colors hover:bg-amber-50 hover:text-amber-700"
          >
            <i className="fa-solid fa-thumbtack text-sm" />
          </button>
        ) : null}
        <span className="text-xs text-gray-400 group-hover:hidden">{timeAgo(m.received_at)}</span>

        <div className="hidden items-center gap-0.5 group-hover:flex">
          {/* 1. Snel afvinken */}
          {onFastDone ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onFastDone(m); }} title="Snel afvinken (f)" hoverColor="hover:bg-emerald-50 hover:text-emerald-700">
              <i className="fa-solid fa-check" />
            </ActionBtn>
          ) : null}
          {/* 2. Snooze */}
          {onSnooze ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onSnooze(m); }} title="Snooze (s)" hoverColor="hover:bg-orange-50 hover:text-orange-700">
              <i className="fa-solid fa-clock" />
            </ActionBtn>
          ) : null}
          {/* 3. Archiveer */}
          {onArchive ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onArchive(m); }} title="Archiveer (e)" hoverColor="hover:bg-gray-100 hover:text-gray-700">
              <i className="fa-solid fa-box-archive" />
            </ActionBtn>
          ) : null}
          {/* 3. Blokkeer/spam */}
          {onBlock ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onBlock(m); }} title="Blokkeer afzender (x)" hoverColor="hover:bg-red-50 hover:text-red-700">
              <i className="fa-solid fa-ban" />
            </ActionBtn>
          ) : null}
          {/* 3b. Spam — alleen email (snel: spam + blokkeer in één klik) */}
          {onMarkSpam && m.channel_type === 'email' ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onMarkSpam(m); }} title="Markeer als spam (deze + alle toekomstige)" hoverColor="hover:bg-red-50 hover:text-red-700">
              <i className="fa-solid fa-shield-halved" />
            </ActionBtn>
          ) : null}
          {/* 4. Plan afspraak */}
          {onSchedule ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onSchedule(m); }} title="Plan afspraak" hoverColor="hover:bg-blue-50 hover:text-blue-700">
              <i className="fa-solid fa-calendar-plus" />
            </ActionBtn>
          ) : null}
          {/* 5. Pin */}
          {onPin && !isPinned ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onPin(m); }} title="Vastzetten" hoverColor="hover:bg-amber-50 hover:text-amber-700">
              <i className="fa-solid fa-thumbtack" />
            </ActionBtn>
          ) : null}
          {/* 6. Doorsturen — alleen email */}
          {onForward && m.channel_type === 'email' ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onForward(m); }} title="Doorsturen (w)" hoverColor="hover:bg-indigo-50 hover:text-indigo-700">
              <i className="fa-solid fa-share" />
            </ActionBtn>
          ) : null}
          {/* Reopen blijft beschikbaar voor logboek/snoozed rijen */}
          {onReopen ? (
            <ActionBtn onClick={(e) => { e.stopPropagation(); onReopen(m); }} title="Terug naar inbox" hoverColor="hover:bg-blue-50 hover:text-blue-700">
              <i className="fa-solid fa-reply" />
            </ActionBtn>
          ) : null}
        </div>
      </div>
    </div>

    {expanded && isAsanaTask ? (
      <ExpandedAsana m={m} onOpen={onClick} onFastDone={onFastDone} onClose={() => setExpanded(false)} />
    ) : null}
    </div>
  );
}

// Uitgeklapte Asana-taak: klant-hero, volledige klantinfo (custom fields), contact-chips,
// assignee en inline actie-knoppen. Knoppen puur op basis van wat beschikbaar is.
// Formatteer een custom-field waarde: ISO-datums → nl-NL korte datum, rest ongewijzigd.
function formatFieldValue(value) {
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return s;
}

function FieldRow({ label, value, colSpan = 1 }) {
  return (
    <div className={`rounded-md border border-gray-200 bg-white px-3 py-2 ${colSpan === 2 ? 'col-span-2' : ''}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-xs text-gray-800">{value}</p>
    </div>
  );
}

// Uitgeklapte Asana-taak als nette kaart (stijl van de Studio/Mila-kaart): header met
// avatar + titel + Asana-badge + assignee, een klant-info blok met alle custom fields,
// een samenvatting en onderaan de actie-knoppen.
function ExpandedAsana({ m, onOpen, onFastDone, onClose }) {
  const stop = (e) => e.stopPropagation();

  let cf = {};
  try { cf = m.asana_custom_fields ? JSON.parse(m.asana_custom_fields) : {}; } catch { cf = {}; }
  const customerName = cf['Account name'] || cf['Customer'] || cf['Klant'] || cf['Company'] || null;
  const country = cf['Country'];
  const status = cf['Account Status'];
  const assigneeShort = m.asana_assignee_email ? m.asana_assignee_email.split('@')[0] : null;

  // Bekende velden met nette NL-labels; overige velden generiek eronder.
  const KNOWN = [
    ['Customer since', 'Klant sinds', 1],
    ['Last Order Date', 'Laatste bestelling', 1],
    ['Last Order', 'Laatste bestelling', 1],
    ['Total Orders', 'Totaal bestellingen', 1],
    ['Average order value', 'Gem. bestelwaarde', 1],
    ['Last two order amounts', 'Laatste 2 orders', 2],
    ['Contact', 'Contact', 2],
  ];
  const shownKeys = new Set(['Account name', 'Customer', 'Klant', 'Company', 'Country', 'Account Status', ...KNOWN.map(([k]) => k)]);
  const rows = [];
  for (const [key, label, span] of KNOWN) {
    if (cf[key] !== undefined && cf[key] !== null && cf[key] !== '') {
      const prefix = key === 'Average order value' ? '€' : '';
      rows.push({ key, label, span, value: `${prefix}${formatFieldValue(cf[key])}` });
    }
  }
  for (const [key, value] of Object.entries(cf)) {
    if (!shownKeys.has(key) && value !== null && value !== '') {
      rows.push({ key, label: key, span: 1, value: formatFieldValue(value) });
    }
  }

  const asanaUrl = m.deep_link || `https://app.asana.com/0/0/${m.external_id}`;

  return (
    <div className="border-t border-purple-100 bg-purple-50/30 px-4 py-4 sm:px-6 sm:py-5" onClick={stop}>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {/* HEADER */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-100">
              <i className="fa-brands fa-asana text-lg text-purple-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">{m.subject}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                  <i className="fa-brands fa-asana text-[10px]" /> Asana
                </span>
                <span className="text-xs text-gray-500">
                  {assigneeShort || 'Onbekend'}
                  {m.received_at ? ` · ${formatDateShort(parseDateSafe(m.received_at))}` : ''}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClose?.(); }}
            className="flex shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
          >
            Sluiten <i className="fa-solid fa-chevron-up text-[10px]" />
          </button>
        </div>

        {/* KLANT INFO */}
        {customerName ? (
          <div className="mb-3 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Klant</p>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700">
                {customerName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">{customerName}</h4>
                {country || status ? (
                  <p className="text-xs text-gray-500">{[country, status].filter(Boolean).join(' · ')}</p>
                ) : null}
              </div>
            </div>
            {rows.length ? (
              <div className="grid grid-cols-2 gap-2">
                {rows.map((r) => <FieldRow key={r.key} label={r.label} value={r.value} colSpan={r.span} />)}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* SAMENVATTING */}
        {m.body_text ? (
          <div className="mb-3 rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Samenvatting</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{m.body_text}</p>
            {assigneeShort ? (
              <div className="mt-3 flex items-center gap-1.5 border-t border-gray-200 pt-3 text-xs text-gray-500">
                <i className="fa-solid fa-link" />
                <span>Asana · toegewezen aan {assigneeShort}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ACTIE KNOPPEN */}
        <div className="flex flex-wrap items-center gap-2">
          {m.asana_contact_email ? (
            <button
              onClick={() => onOpen?.()}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700"
            >
              <i className="fa-solid fa-envelope" /> Email
            </button>
          ) : null}
          {m.asana_contact_phone ? (
            <button
              onClick={() => onOpen?.()}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700"
            >
              <i className="fa-brands fa-whatsapp" /> WhatsApp
            </button>
          ) : null}
          {m.asana_contact_phone ? (
            <a
              href={`tel:${m.asana_contact_phone}`}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <i className="fa-solid fa-phone" /> Bel
            </a>
          ) : null}
          <a
            href={asanaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
          >
            <i className="fa-brands fa-asana" /> Bekijk in Asana
          </a>
          {onFastDone ? (
            <button
              onClick={() => onFastDone(m)}
              className="ml-auto flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <i className="fa-solid fa-check" /> Afvinken
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, title, hoverColor }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`grid h-8 w-8 place-items-center rounded-md text-base text-gray-500 transition-colors ${hoverColor || 'hover:bg-gray-100'}`}
    >
      {children}
    </button>
  );
}
