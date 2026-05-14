import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useMessages(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, v);
  const path = `/messages${qs.size ? `?${qs}` : ''}`;
  return useQuery({
    queryKey: ['messages', params],
    queryFn: () => api.get(path),
  });
}

export function useMessage(id) {
  return useQuery({
    queryKey: ['message', id],
    queryFn: () => api.get(`/messages/${id}`),
    enabled: !!id,
  });
}

export function useThread(messageId) {
  return useQuery({
    queryKey: ['thread', messageId],
    queryFn: () => api.get(`/messages/${messageId}/thread`),
    enabled: !!messageId,
  });
}

export function useReplyMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body_text, body_html, cc, bcc }) =>
      api.post(`/messages/${id}/reply`, { body_text, body_html, cc, bcc }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['thread'] });
      qc.invalidateQueries({ queryKey: ['message', vars.id] });
    },
  });
}

export function useReplyWithMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, text, files }) => {
      const form = new FormData();
      if (text) form.append('text', text);
      for (const f of files) form.append('files', f, f.name);
      const res = await fetch(`/api/messages/${id}/reply-with-media`, { method: 'POST', body: form });
      const txt = await res.text();
      let data = null;
      try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
      if (!res.ok) {
        const err = new Error(data?.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['thread'] });
      qc.invalidateQueries({ queryKey: ['message', vars.id] });
    },
  });
}

export function useSyncAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/sync/all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['channels'] });
      qc.invalidateQueries({ queryKey: ['auth-status'] });
    },
  });
}

export function useSyncChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId) => api.post(`/sync/${channelId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['channels'] });
      qc.invalidateQueries({ queryKey: ['auth-status'] });
    },
  });
}

export function useSnoozeMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, snoozed_until }) => api.patch(`/messages/${id}/snooze`, { snoozed_until }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useDoneMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note, category }) => api.patch(`/messages/${id}/done`, { note, category }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useReopenMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => api.patch(`/messages/${id}/reopen`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useWaitingMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => api.patch(`/messages/${id}/waiting`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function usePriorityMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, priority }) => api.patch(`/messages/${id}/priority`, { priority }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}

export function useArchiveMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => api.delete(`/messages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useBulkArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids }) => api.post('/messages/bulk/archive', { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useBulkReopen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids }) => api.post('/messages/bulk/reopen', { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function usePinnedMessages() {
  return useQuery({
    queryKey: ['messages', 'pinned'],
    queryFn: () => api.get('/messages/pinned'),
  });
}

export function usePinMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => api.post(`/messages/${id}/pin`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}

export function useUnpinMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => api.delete(`/messages/${id}/pin`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}

export function useBulkSnooze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, snoozed_until }) => api.post('/messages/bulk/snooze', { ids, snoozed_until }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useBulkDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, note, category }) => api.post('/messages/bulk/done', { ids, note, category }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useContactMessages(contactId) {
  return useQuery({
    queryKey: ['contact-messages', contactId],
    queryFn: () => api.get(`/contacts/${contactId}/messages`),
    enabled: !!contactId,
  });
}
