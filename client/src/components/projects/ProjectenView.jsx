const COLUMNS = [
  { id: 'active', label: 'Active', color: '#3b82f6', bg: '#eff6ff' },
  { id: 'paused', label: 'Paused', color: '#ea580c', bg: '#fff7ed' },
  { id: 'done', label: 'Done', color: '#16a34a', bg: '#f0fdf4' },
];

export default function ProjectenView() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-8 py-5">
        <h1 className="text-xl font-semibold text-gray-900">🗂️ Projecten</h1>
        <p className="mt-0.5 text-sm text-gray-500">Tag berichten en contacten met projecten</p>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin">
        <div className="mx-8 my-6 space-y-4">
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            ℹ️ Projecten worden gebouwd in een latere stap. Tag berichten met projecten bij het afhandelen om ze hier te zien.
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {COLUMNS.map((c) => (
              <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ background: c.bg, color: c.color }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
                    {c.label}
                  </span>
                  <span className="text-xs text-gray-400">0</span>
                </div>
                <div className="rounded-md border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">
                  Geen projecten
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
