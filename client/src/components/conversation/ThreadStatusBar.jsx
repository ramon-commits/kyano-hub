export default function ThreadStatusBar({ onSnooze, onDone, onSchedule, onUrgent, onArchive, currentPriority }) {
  const isUrgent = currentPriority === 'high';
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-gray-50 px-6 py-3">
      <Btn onClick={onSnooze} color="hover:bg-orange-100 hover:text-orange-800">
        ⏰ Snooze
      </Btn>
      <Btn onClick={onDone} color="hover:bg-green-100 hover:text-green-800">
        ✅ Afgehandeld
      </Btn>
      <Btn onClick={onSchedule} color="hover:bg-blue-100 hover:text-blue-800">
        📅 Plan afspraak
      </Btn>
      <Btn
        onClick={onUrgent}
        color={isUrgent ? 'bg-red-100 text-red-800' : 'hover:bg-red-100 hover:text-red-800'}
      >
        🔴 {isUrgent ? 'Urgent' : 'Markeer urgent'}
      </Btn>
      <Btn onClick={onArchive} color="hover:bg-gray-200 hover:text-gray-800">
        🗑️ Archiveer
      </Btn>
    </div>
  );
}

function Btn({ children, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors ${color}`}
    >
      {children}
    </button>
  );
}
