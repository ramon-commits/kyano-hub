import { useState } from 'react';

export default function ThreadStatusBar({ onSnooze, onDone, onSchedule, onUrgent, onArchive, onForward, onFollowUp, showFollowUp, currentPriority }) {
  const isUrgent = currentPriority === 'high';
  const [followUpLoading, setFollowUpLoading] = useState(false);

  async function handleFollowUp() {
    if (!onFollowUp || followUpLoading) return;
    setFollowUpLoading(true);
    try {
      await onFollowUp();
    } finally {
      setFollowUpLoading(false);
    }
  }

  return (
    <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white px-5 py-3">
      <Btn onClick={onSnooze} hover="hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200">
        <i className="fa-solid fa-clock mr-1.5" />Snooze
      </Btn>
      <Btn onClick={onDone} hover="hover:bg-green-50 hover:text-green-700 hover:border-green-200">
        <i className="fa-solid fa-circle-check mr-1.5" />Afgehandeld
      </Btn>
      <Btn onClick={onSchedule} hover="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200">
        <i className="fa-solid fa-calendar-days mr-1.5" />Plan afspraak
      </Btn>
      {showFollowUp && onFollowUp ? (
        <Btn
          onClick={handleFollowUp}
          disabled={followUpLoading}
          hover="hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200"
          title="Genereer een follow-up bericht — verschijnt alleen wanneer het laatste bericht van jou was"
        >
          {followUpLoading ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-purple-300 border-t-purple-600" />
              Genereren…
            </span>
          ) : (
            <><i className="fa-solid fa-reply mr-1.5" />Follow-up</>
          )}
        </Btn>
      ) : null}
      <Btn
        onClick={onUrgent}
        active={isUrgent}
        hover="hover:bg-red-50 hover:text-red-700 hover:border-red-200"
      >
        <i className="fa-solid fa-circle text-red-500 mr-1.5" />{isUrgent ? 'Urgent' : 'Markeer urgent'}
      </Btn>
      {onForward ? (
        <Btn onClick={onForward} hover="hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200" title="Doorsturen (w)">
          <i className="fa-solid fa-share mr-1.5" />Doorsturen
        </Btn>
      ) : null}
      <Btn onClick={onArchive} hover="hover:bg-gray-100 hover:text-gray-900 hover:border-gray-300">
        <i className="fa-solid fa-box-archive mr-1.5" />Archiveer
      </Btn>
    </div>
  );
}

function Btn({ children, onClick, hover, active, disabled, title }) {
  const base = 'rounded-lg border px-3 py-1.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60';
  const cls = active
    ? `${base} border-red-300 bg-red-50 text-red-700`
    : `${base} border-gray-200 bg-white text-gray-700 ${hover}`;
  return <button onClick={onClick} disabled={disabled} title={title} className={cls}>{children}</button>;
}
