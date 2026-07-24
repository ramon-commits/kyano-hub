import { useMemo, useState } from 'react';
import { useSocialPosts, useCreateSocialPost, useUpdateSocialPost, useDeleteSocialPost } from '../../hooks/useSocial.js';
import { useToast } from '../../hooks/useToast.jsx';
import PageHeader from '../shared/PageHeader.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import LoadingSpinner from '../shared/LoadingSpinner.jsx';
import { cn, formatDateShort, formatTime, parseDateSafe } from '../../lib/utils.js';
import { api } from '../../lib/api.js';

const TABS = [
  { id: 'scheduled', label: 'Planner', icon: 'calendar-day' },
  { id: 'published', label: 'Gepubliceerd', icon: 'circle-check' },
  { id: 'draft', label: 'Concepten', icon: 'file-pen' },
];

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: 'instagram', color: '#ec4899', limit: 2200 },
  { id: 'linkedin',  label: 'LinkedIn',  icon: 'linkedin',  color: '#0a66c2', limit: 3000 },
];

function platformMeta(id) {
  return PLATFORMS.find((p) => p.id === id) || { id, label: id, icon: 'share-nodes', color: '#6b7280', limit: 3000 };
}

export default function SocialPlannerView() {
  const [tab, setTab] = useState('scheduled');
  const [editor, setEditor] = useState({ open: false, post: null });
  const { data, isLoading } = useSocialPosts({ status: tab });
  const posts = data?.posts || [];
  const toast = useToast();
  const createMut = useCreateSocialPost();
  const updateMut = useUpdateSocialPost();
  const deleteMut = useDeleteSocialPost();

  async function handleSave({ id, ...body }) {
    try {
      if (id) await updateMut.mutateAsync({ id, ...body });
      else await createMut.mutateAsync(body);
      toast.success(id ? 'Post bijgewerkt' : 'Post aangemaakt');
      setEditor({ open: false, post: null });
    } catch (e) {
      toast.error(e.message || 'Opslaan mislukt');
    }
  }

  async function handleDelete(post) {
    if (!confirm(`Verwijder deze ${platformMeta(post.platform).label} post?`)) return;
    try {
      await deleteMut.mutateAsync(post.id);
      toast.info('Post verwijderd');
    } catch (e) {
      toast.error(e.message || 'Verwijderen mislukt');
    }
  }

  async function handlePublish(post) {
    try {
      await api.post(`/social/posts/${post.id}/publish`);
      toast.info('Auto-publicatie komt in v2 — gebruik nu de native app van het platform', 'Niet beschikbaar');
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Social"
        subtitle="Plan en beheer je posts voor Instagram en LinkedIn"
        actions={
          <button
            onClick={() => setEditor({ open: true, post: null })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <i className="fa-solid fa-plus" />
            Nieuwe post
          </button>
        }
      />

      <div className="border-b border-gray-200 bg-white px-8 pt-3">
        <div className="inline-flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all',
                tab === t.id
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
              )}
            >
              <i className={`fa-solid fa-${t.icon}`} />{t.label}
            </button>
          ))}
        </div>
        <div className="pt-3" />
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 scrollbar-thin">
        <div className="mx-8 my-6">
          {isLoading ? (
            <div className="rounded-xl border border-gray-200 bg-white py-12"><LoadingSpinner label="Posts laden…" /></div>
          ) : posts.length === 0 ? (
            <EmptyState
              icon="share-nodes"
              title={tab === 'scheduled' ? 'Niets ingepland' : tab === 'published' ? 'Nog niets gepubliceerd' : 'Geen concepten'}
              description={tab === 'scheduled' ? 'Maak een nieuwe post en plan deze in.' : 'Klik op "Nieuwe post" om te beginnen.'}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  onEdit={() => setEditor({ open: true, post: p })}
                  onDelete={() => handleDelete(p)}
                  onPublish={() => handlePublish(p)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {editor.open ? (
        <PostEditor
          post={editor.post}
          onClose={() => setEditor({ open: false, post: null })}
          onSave={handleSave}
          saving={createMut.isPending || updateMut.isPending}
        />
      ) : null}
    </div>
  );
}

function PostCard({ post, onEdit, onDelete, onPublish }) {
  const p = platformMeta(post.platform);
  const scheduled = post.scheduled_at ? parseDateSafe(post.scheduled_at) : null;
  const published = post.published_at ? parseDateSafe(post.published_at) : null;
  const caption = post.caption || '';
  const truncated = caption.length > 220 ? caption.slice(0, 217) + '…' : caption;
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5" style={{ background: `${p.color}10` }}>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: p.color }}>
          <i className={`fa-brands fa-${p.icon}`} />{p.label}
        </span>
        <StatusBadge status={post.status} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        {truncated ? (
          <p className="mb-3 line-clamp-4 flex-1 whitespace-pre-wrap text-sm text-gray-700">{truncated}</p>
        ) : (
          <p className="mb-3 flex-1 text-sm italic text-gray-400">(geen caption)</p>
        )}
        {Array.isArray(post.tags) && post.tags.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1">
            {post.tags.slice(0, 4).map((t) => (
              <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">#{t}</span>
            ))}
            {post.tags.length > 4 ? <span className="text-[10px] text-gray-400">+{post.tags.length - 4}</span> : null}
          </div>
        ) : null}
        <div className="text-[11px] text-gray-500">
          {published ? (
            <span><i className="fa-solid fa-circle-check mr-1 text-emerald-500" />Gepubliceerd {formatDateShort(published)} {formatTime(published)}</span>
          ) : scheduled ? (
            <span><i className="fa-solid fa-clock mr-1 text-blue-500" />{formatDateShort(scheduled)} · {formatTime(scheduled)}</span>
          ) : (
            <span className="text-gray-400">Niet ingepland</span>
          )}
          {post.account_label ? <span className="ml-1 text-gray-400">· {post.account_label}</span> : null}
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-gray-100 bg-gray-50 px-3 py-2 text-xs">
        <button onClick={onEdit} className="rounded-md px-2 py-1 font-medium text-gray-700 transition-colors hover:bg-white hover:text-blue-600">
          <i className="fa-solid fa-pen-to-square mr-1" />Bewerken
        </button>
        <button onClick={onPublish} className="rounded-md px-2 py-1 font-medium text-gray-700 transition-colors hover:bg-white hover:text-purple-600">
          <i className="fa-solid fa-paper-plane mr-1" />Publiceer
        </button>
        <button onClick={onDelete} className="ml-auto rounded-md px-2 py-1 font-medium text-gray-500 transition-colors hover:bg-white hover:text-red-600">
          <i className="fa-solid fa-trash" />
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    draft: { label: 'Concept', bg: '#f3f4f6', color: '#4b5563' },
    scheduled: { label: 'Ingepland', bg: '#dbeafe', color: '#1e40af' },
    published: { label: 'Live', bg: '#dcfce7', color: '#166534' },
    failed: { label: 'Mislukt', bg: '#fee2e2', color: '#991b1b' },
  };
  const m = map[status] || map.draft;
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}

function PostEditor({ post, onClose, onSave, saving }) {
  const isNew = !post;
  const [platform, setPlatform] = useState(post?.platform || 'instagram');
  const [caption, setCaption] = useState(post?.caption || '');
  const [scheduledAt, setScheduledAt] = useState(post?.scheduled_at ? toLocalInput(post.scheduled_at) : '');
  const [tagsInput, setTagsInput] = useState(Array.isArray(post?.tags) ? post.tags.join(', ') : '');
  const [accountLabel, setAccountLabel] = useState(post?.account_label || '');

  const meta = platformMeta(platform);
  const limitClass = caption.length > meta.limit ? 'text-red-600 font-semibold' : caption.length > meta.limit * 0.9 ? 'text-amber-600' : 'text-gray-500';
  const willOverflow = caption.length > meta.limit;

  function build(status) {
    return {
      id: post?.id,
      platform,
      status,
      caption: caption || null,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      tags: tagsInput.split(',').map((x) => x.trim()).filter(Boolean),
      account_label: accountLabel || null,
    };
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
          <h2 className="text-base font-semibold text-gray-900">
            {isNew ? 'Nieuwe post' : 'Post bewerken'}
          </h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <i className="fa-solid fa-xmark" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Platform */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">Platform</label>
            <div className="inline-flex gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all',
                    platform === p.id ? 'border-current shadow-sm' : 'border-gray-200 text-gray-700 hover:border-gray-300',
                  )}
                  style={platform === p.id ? { color: p.color, background: `${p.color}15` } : {}}
                >
                  <i className={`fa-brands fa-${p.icon}`} />{p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Caption */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Caption</label>
              <span className={`text-[11px] ${limitClass}`}>{caption.length} / {meta.limit}</span>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={8}
              placeholder={`Schrijf je ${meta.label} caption…`}
              className={cn(
                'w-full resize-none rounded-lg border bg-gray-50 px-3 py-2.5 text-sm leading-relaxed outline-none transition-all focus:bg-white focus:ring-2',
                willOverflow ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' : 'border-gray-200 focus:border-blue-500 focus:ring-blue-500/10',
              )}
            />
          </div>

          {/* Scheduled at */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">Gepland voor</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">Account label (optioneel)</label>
              <input
                type="text"
                value={accountLabel}
                onChange={(e) => setAccountLabel(e.target.value)}
                placeholder="bv. @endlessminds"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">Tags / Hashtags</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="lancering, kyano, horaizon (komma-gescheiden)"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          {/* Media placeholder */}
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-xs text-gray-500">
            <i className="fa-solid fa-image mr-1.5" />
            Media upload komt in v2 (Instagram/LinkedIn Graph API koppeling)
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-white hover:text-gray-900"
          >
            Annuleren
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => onSave(build('draft'))}
              disabled={saving || willOverflow}
              className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Opslaan als concept
            </button>
            <button
              onClick={() => onSave(build('scheduled'))}
              disabled={saving || willOverflow || !scheduledAt}
              className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              title={!scheduledAt ? 'Kies een datum/tijd om in te plannen' : ''}
            >
              {saving ? 'Opslaan…' : 'Inplannen'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// Convert ISO/UTC string to <input type="datetime-local"> value in local tz
function toLocalInput(iso) {
  const d = parseDateSafe(iso);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
