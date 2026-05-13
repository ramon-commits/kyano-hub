import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useToast } from '../../hooks/useToast.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import Badge from '../shared/Badge.jsx';

export default function UnipileSettings() {
  const [status, setStatus] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [apiKey, setApiKey] = useState('');
  const [dsn, setDsn] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();

  const refresh = async () => {
    try {
      const r = await api.get('/settings/unipile');
      setStatus(r);
      setDsn(r.dsn || '');
      if (r.configured) {
        try {
          const sync = await api.post('/sync/unipile');
          setAccounts(sync.results || []);
        } catch (e) {
          toast.error(e.message || 'Unipile sync mislukt');
        }
      }
    } catch (e) {
      // Stille fail
    }
  };

  useEffect(() => { refresh(); }, []);

  const save = async () => {
    if (!apiKey || !dsn) {
      toast.error('Vul zowel API Key als DSN in');
      return;
    }
    setBusy(true);
    try {
      const r = await api.post('/settings/unipile', { api_key: apiKey, dsn });
      toast.success(`${r.accounts.length} Unipile account(s) gevonden`);
      setAccounts(r.accounts || []);
      setStatus({ configured: true, dsn });
      setApiKey('');
      qc.invalidateQueries({ queryKey: ['channels'] });
      qc.invalidateQueries({ queryKey: ['messages'] });
    } catch (e) {
      toast.error(e.message || 'Credentials niet geldig');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Unipile loskoppelen? Berichten blijven bewaard.')) return;
    try {
      await api.delete('/settings/unipile');
      toast.info('Unipile losgekoppeld');
      setStatus({ configured: false });
      setAccounts([]);
    } catch (e) { toast.error(e.message); }
  };

  if (status?.configured) {
    return (
      <div className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-green-900">✅ Unipile verbonden</h4>
            <p className="mt-0.5 text-xs text-green-700">DSN: <code>{status.dsn}</code></p>
          </div>
          <button onClick={disconnect} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
            Loskoppelen
          </button>
        </div>
        {accounts.length > 0 ? (
          <div className="space-y-2 rounded-md bg-white p-3">
            <div className="text-xs font-medium uppercase tracking-wider text-gray-500">Gekoppelde accounts</div>
            {accounts.map((a) => (
              <div key={a.unipile_account_id || a.id} className="flex items-center justify-between gap-3 rounded-md border border-gray-100 px-3 py-2 text-sm">
                <span className="font-medium">{(a.type || '').toUpperCase()}</span>
                {a.ok === false ? (
                  <Badge color="#dc2626" bg="#fef2f2">⚠️ {a.error || a.reason}</Badge>
                ) : (
                  <Badge color="#16a34a" bg="#f0fdf4">{a.inserted ?? 0} nieuwe</Badge>
                )}
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={refresh}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            🔄 Sync nu
          </button>
          <button
            onClick={async () => {
              if (!confirm('Alle WhatsApp/LinkedIn/Instagram berichten worden verwijderd en opnieuw opgehaald met de nieuwe namen-extractie. Doorgaan?')) return;
              try {
                const r = await api.post('/admin/resync-unipile');
                toast.success(`${r.deleted_messages} berichten gewist + ${r.resync?.total_new || 0} opnieuw gesynced`, '🔁 Reset compleet');
                qc.invalidateQueries({ queryKey: ['messages'] });
                qc.invalidateQueries({ queryKey: ['stats'] });
                qc.invalidateQueries({ queryKey: ['channels'] });
                refresh();
              } catch (e) { toast.error(e.message || 'Resync mislukt'); }
            }}
            className="rounded-md border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
            title="Wist alle Unipile berichten en haalt ze opnieuw op met verbeterde namen/sender extractie"
          >
            🔁 Reset & resync (na namen-fix)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-5">
      <h4 className="text-sm font-semibold text-blue-900">📱 WhatsApp, Instagram & LinkedIn koppelen via Unipile</h4>
      <ol className="ml-5 list-decimal space-y-1 text-xs text-blue-800">
        <li>Ga naar <a className="underline" href="https://unipile.com" target="_blank" rel="noopener noreferrer">unipile.com</a> en maak een account aan (7 dagen gratis trial)</li>
        <li>Koppel WhatsApp / Instagram / LinkedIn via QR-code in het Unipile dashboard</li>
        <li>Kopieer je <strong>API Key</strong> en <strong>DSN URL</strong> hieronder</li>
      </ol>

      <div className="space-y-2 rounded-md bg-white p-3">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="k7rf0a5u..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-gray-500">DSN URL</label>
          <input
            type="text"
            value={dsn}
            onChange={(e) => setDsn(e.target.value)}
            placeholder="https://api43.unipile.com:17398"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={save}
          disabled={busy}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Valideren…' : '🔐 Opslaan en accounts ophalen'}
        </button>
      </div>
    </div>
  );
}
