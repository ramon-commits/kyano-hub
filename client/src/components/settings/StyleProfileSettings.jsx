import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../../hooks/useToast.jsx';

function formatUpdated(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    return d.toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function StyleProfileSettings() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/ai/style-profile');
      setProfile(r?.profile || null);
    } catch (e) {
      toast.error(e.message || 'Profiel laden mislukt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const r = await api.post('/ai/analyze-style', {});
      if (r?.ok === false) {
        toast.warning(r.error || `Te weinig verzonden berichten (${r.count || 0})`);
        return;
      }
      if (r?.profile) {
        toast.success(`Stijl geanalyseerd — ${r.emails_analyzed} email + ${r.chats_analyzed} chat berichten`);
        await load();
      } else {
        toast.error('Geen profiel ontvangen');
      }
    } catch (e) {
      toast.error(e.message || 'Analyse mislukt');
    } finally {
      setAnalyzing(false);
    }
  };

  const profileText = profile?.profile_text || '';
  const updated = formatUpdated(profile?.updated_at);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              <i className="fa-solid fa-palette mr-2 text-purple-600" />AI Stijlprofiel
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Claude analyseert je verzonden berichten om je schrijfstijl te leren. Dit profiel wordt gebruikt voor Verbeter NL, Vertaal, AI varianten en Follow-up.
            </p>
            {updated ? (
              <p className="mt-2 text-xs text-gray-500">
                <i className="fa-solid fa-clock mr-1" />Laatste analyse: {updated}
                {profile?.email_count != null ? (
                  <span className="ml-2">· {profile.email_count} email + {profile.chat_count} chat</span>
                ) : null}
              </p>
            ) : null}
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="shrink-0 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-purple-700 disabled:opacity-50"
          >
            {analyzing ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Analyseren…
              </span>
            ) : (
              <><i className="fa-solid fa-wand-magic-sparkles mr-1.5" />{profileText ? 'Opnieuw analyseren' : 'Analyseer mijn stijl'}</>
            )}
          </button>
        </div>

        {loading ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
            <i className="fa-solid fa-spinner fa-spin mr-2" />Laden…
          </div>
        ) : profileText ? (
          <div className="rounded-lg border border-purple-100 bg-purple-50/40 p-4">
            <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-gray-800">
              {profileText}
            </pre>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <i className="fa-solid fa-info-circle mr-1.5" />
            Nog geen profiel. Klik op &quot;Analyseer mijn stijl&quot; om er een te genereren op basis van je laatste verzonden berichten.
          </div>
        )}
      </div>

      {profile?.general_tone || profile?.signature ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Bestaande handmatige instellingen</h3>
          <div className="space-y-2 text-sm">
            {profile.general_tone ? (
              <div><span className="text-gray-500">Toon:</span> <span className="text-gray-800">{profile.general_tone}</span></div>
            ) : null}
            {profile.signature ? (
              <div><span className="text-gray-500">Signature:</span> <span className="text-gray-800 whitespace-pre-line">{profile.signature}</span></div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
