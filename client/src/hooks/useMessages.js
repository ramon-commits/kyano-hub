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
