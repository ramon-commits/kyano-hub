import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useThreadSummary } from '../../hooks/useMessages.js';
import { api } from '../../lib/api.js';

function parseSummary(text) {
  if (!text) return null;
  const out = { samenvatting: null, status: null, actie: null, rest: [] };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([A-ZÀ-Ÿ]+):\s*(.+)$/);
    if (m) {
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === 'samenvatting' || key === 'summary') out.samenvatting = val;
      else if (key === 'status') out.status = val;
      else if (key === 'actie' || key === 'action') out.actie = val;
      else out.rest.push(line);
    } else {
      out.rest.push(line);
    }
  }
  if (!out.samenvatting && !out.status && !out.actie && out.rest.length > 0) {
    out.samenvatting = out.rest.join(' ');
    out.rest = [];
  }
  return out;
}

export default function ThreadAiSummaryCard({ messageId }) {
  const { data, isLoading } = useThreadSummary(messageId);
  const [refreshing, setRefreshing] = useState(false);
  const qc = useQueryClient();

  if (!data && !isLoading) return null;

  const summary = data?.ai_summary ? parseSummary(data.ai_summary) : null;
  const hasAI = !!summary;
  const showLoading = (isLoading && !data) || refreshing;

  const handleRefresh = async () => {
    if (!messageId || refreshing) return;
    setRefreshing(true);
    try {
      const fresh = await api.get(`/messages/${messageId}/thread-summary?refresh=true`);
      qc.setQueryData(['thread-summary', messageId], fresh);
    } catch { /* silent */ } finally {
      setRefreshing(false);
    }
  };

  const noActieMatch = summary?.actie && /geen\s+actie/i.test(summary.actie);

  return (
    <div className="mx-4 mt-3 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700">
          <i className="fa-solid fa-wand-magic-sparkles" />
          AI thread-samenvatting
        </div>
        {hasAI ? (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-blue-400 transition-colors hover:text-blue-700 disabled:opacity-50"
            title="Samenvatting vernieuwen"
            aria-label="Vernieuwen"
          >
            <i className={`fa-solid fa-arrows-rotate text-xs ${refreshing ? 'fa-spin' : ''}`} />
          </button>
        ) : null}
      </div>

      <div className="mt-1.5 space-y-1 text-sm">
        {showLoading ? (
          <div className="flex items-center gap-2 text-blue-600">
            <i className="fa-solid fa-spinner fa-spin" />
            Thread analyseren…
          </div>
        ) : hasAI ? (
          <>
            {summary.samenvatting ? (
              <p className="text-gray-800">{summary.samenvatting}</p>
            ) : null}
            {summary.status ? (
              <p className="text-gray-600">
                <i className="fa-solid fa-circle-info mr-1.5 text-blue-500" />
                {summary.status}
              </p>
            ) : null}
            {summary.actie ? (
              <p className={noActieMatch ? 'text-green-700' : 'font-medium text-orange-700'}>
                <i className={`fa-solid mr-1.5 ${noActieMatch ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />
                {summary.actie}
              </p>
            ) : null}
            {summary.rest?.length ? (
              <p className="text-gray-500">{summary.rest.join(' ')}</p>
            ) : null}
          </>
        ) : data ? (
          <div className="text-gray-600">
            {data.total_messages} bericht{data.total_messages === 1 ? '' : 'en'}
            {data.participants?.length ? ` · ${data.participants.map((p) => p.name).join(', ')}` : ''}
            {data.has_attachments ? ` · ${data.attachment_count} bijlage${data.attachment_count === 1 ? '' : 'n'}` : ''}
          </div>
        ) : null}
      </div>
    </div>
  );
}
