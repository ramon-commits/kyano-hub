export default function BulkActionBar({ count, onSnooze, onDone, onArchive, onBlock, onSpam, onClear, busy }) {
  if (!count) return null;

  return (
    <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center px-4">
      <div
        role="toolbar"
        aria-label={`${count} berichten geselecteerd`}
        className="pointer-events-auto flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-white shadow-2xl ring-1 ring-black/20"
      >
        <span className="mr-1 inline-flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-500 text-[11px] font-bold tabular-nums">
            {count}
          </span>
          geselecteerd
        </span>

        <BulkBtn onClick={onSnooze} disabled={busy} title="Snooze alle (S)"><i className="fa-solid fa-clock mr-1.5" />Snooze</BulkBtn>
        <BulkBtn onClick={onDone} disabled={busy} title="Markeer alle afgehandeld (E)"><i className="fa-solid fa-circle-check mr-1.5" />Done</BulkBtn>
        <BulkBtn onClick={onArchive} disabled={busy} title="Archiveer alle (#)"><i className="fa-solid fa-trash mr-1.5" />Archiveer</BulkBtn>
        <BulkBtn onClick={onBlock} disabled={busy} title="Blokkeer alle afzenders"><i className="fa-solid fa-ban mr-1.5" />Blokkeer</BulkBtn>
        {onSpam ? (
          <button
            onClick={onSpam}
            disabled={busy}
            title="Markeer alle als spam (Gmail spam + blokkeer)"
            className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="fa-solid fa-shield-halved mr-1.5" />Spam ({count})
          </button>
        ) : null}

        <span className="mx-1 h-5 w-px bg-white/20" />

        <button
          onClick={onClear}
          disabled={busy}
          title="Deselecteer (Esc)"
          className="rounded-md px-2 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <i className="fa-solid fa-xmark mr-1.5" />Annuleer
        </button>
      </div>
    </div>
  );
}

function BulkBtn({ children, onClick, disabled, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-md px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
