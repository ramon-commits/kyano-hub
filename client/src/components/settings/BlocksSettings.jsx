import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { useToast } from '../../hooks/useToast.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';

const RULE_LABELS = {
  block: 'Geblokkeerd',
  newsletter: 'Nieuwsbrief',
  info: 'Info',
  allow: 'Toegestaan',
};

export default function BlocksSettings() {
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sender-rules'],
    queryFn: () => api.get('/settings/sender-rules'),
  });

  const unblock = async (id) => {
    try {
      await api.delete(`/settings/sender-rules/${id}`);
      await refetch();
      toast.success('Blokkade verwijderd');
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  };

  const rules = (data?.rules || []).filter((r) => r.rule === 'block');

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="font-semibold text-gray-900">Geblokkeerde afzenders</h3>
      <p className="mt-1 mb-4 text-sm text-gray-500">
        Berichten van deze afzenders worden automatisch gearchiveerd en komen niet in je inbox.
      </p>

      {isLoading ? (
        <div className="py-10"><LoadingSpinner label="Blokkades laden…" /></div>
      ) : isError ? (
        <div className="py-6 text-center">
          <p className="text-sm font-medium text-red-600">Kon blokkades niet laden</p>
          <p className="mt-1 text-xs text-gray-500">{error?.message || 'Onbekende fout'}</p>
          <button onClick={() => refetch()} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            Opnieuw proberen
          </button>
        </div>
      ) : rules.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">Nog geen geblokkeerde afzenders.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-900">{r.email_pattern}</div>
                <div className="text-xs text-gray-500">
                  {r.email_pattern?.startsWith('@') ? 'Heel domein' : 'Email-adres'}
                  {' · '}
                  {RULE_LABELS[r.rule] || r.rule}
                  {r.created_at ? ` · geblokkeerd ${new Date(r.created_at).toLocaleDateString('nl-NL')}` : ''}
                </div>
              </div>
              <button
                onClick={() => unblock(r.id)}
                className="shrink-0 text-sm font-medium text-blue-600 hover:underline"
              >
                Ontblokkeren
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
