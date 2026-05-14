import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../hooks/useToast.jsx';

export default function BirthdayImportSettings() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  const toast = useToast();
  const qc = useQueryClient();

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const text = await file.text();
      const res = await fetch('/api/contacts/import-birthdays', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Import mislukt');
      }
      setResult(data);
      toast.success(
        `${data.imported} nieuw, ${data.updated} bijgewerkt`,
        'Verjaardagen geïmporteerd',
      );
      qc.invalidateQueries({ queryKey: ['birthdays'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    } catch (e) {
      toast.error(e.message || 'Import mislukt');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <i className="fa-solid fa-cake-candles text-pink-600" />
        <h2 className="text-base font-semibold text-gray-900">Verjaardagen importeren</h2>
      </div>

      <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
        <div className="mb-2 font-medium">Importeer verjaardagen van Facebook</div>
        <ol className="list-decimal space-y-1 pl-5 text-[13px] text-blue-800">
          <li>
            Ga naar{' '}
            <a
              href="https://www.facebook.com/events/birthdays"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline hover:text-blue-700"
            >
              facebook.com/events/birthdays
            </a>
          </li>
          <li>Klik op het tandwiel-icoon rechts boven de lijst</li>
          <li>Download het .ics kalenderbestand</li>
          <li>Upload het hieronder</li>
        </ol>
      </div>

      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-sm transition-colors ${
          busy
            ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
            : 'border-gray-300 bg-gray-50 text-gray-600 hover:border-pink-400 hover:bg-pink-50/40 hover:text-pink-700'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".ics,.ical,.icalendar,text/calendar"
          disabled={busy}
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="hidden"
        />
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-pink-300 border-t-pink-600" />
            Importeren…
          </span>
        ) : (
          <>
            <i className="fa-solid fa-cloud-arrow-up text-2xl" />
            <span className="font-medium">Klik om een .ics bestand te kiezen</span>
            <span className="text-xs text-gray-500">Of sleep het bestand hierheen</span>
          </>
        )}
      </label>

      {result ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Nieuw" value={result.imported} color="text-emerald-600" />
          <Stat label="Bijgewerkt" value={result.updated} color="text-blue-600" />
          <Stat label="Overgeslagen" value={result.skipped} color="text-gray-500" />
          <Stat label="Totaal" value={result.total} color="text-gray-900" />
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold leading-none ${color}`}>{value ?? 0}</div>
    </div>
  );
}
