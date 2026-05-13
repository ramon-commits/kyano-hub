export default function ThreadStatusBar({ onSnooze, onDone, onSchedule, onUrgent, onArchive, currentPriority }) {
  const isUrgent = currentPriority === 'high';
  return (
    <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white px-5 py-3">
      <Btn onClick={onSnooze} hover="hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200">
        ⏰ Snooze
      </Btn>
      <Btn onClick={onDone} hover="hover:bg-green-50 hover:text-green-700 hover:border-green-200">
        ✅ Afgehandeld
      </Btn>
      <Btn onClick={onSchedule} hover="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200">
        📅 Plan afspraak
      </Btn>
      <Btn
        onClick={onUrgent}
        active={isUrgent}
        hover="hover:bg-red-50 hover:text-red-700 hover:border-red-200"
      >
        🔴 {isUrgent ? 'Urgent' : 'Markeer urgent'}
      </Btn>
      <Btn onClick={onArchive} hover="hover:bg-gray-100 hover:text-gray-900 hover:border-gray-300">
        🗑️ Archiveer
      </Btn>
    </div>
  );
}

function Btn({ children, onClick, hover, active }) {
  const base = 'rounded-lg border px-3 py-1.5 text-sm font-medium transition-all';
  const cls = active
    ? `${base} border-red-300 bg-red-50 text-red-700`
    : `${base} border-gray-200 bg-white text-gray-700 ${hover}`;
  return <button onClick={onClick} className={cls}>{children}</button>;
}
