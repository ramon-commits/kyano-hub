import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useQuickReplies(channelType) {
  const qs = channelType ? `?channel_type=${encodeURIComponent(channelType)}` : '';
  return useQuery({
    queryKey: ['quick-replies', channelType || 'all'],
    queryFn: () => api.get(`/quick-replies${qs}`),
    staleTime: 60_000,
  });
}

export function useCreateQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post('/quick-replies', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quick-replies'] }),
  });
}

export function useUpdateQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...rest }) => api.patch(`/quick-replies/${id}`, rest),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quick-replies'] }),
  });
}

export function useDeleteQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => api.delete(`/quick-replies/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quick-replies'] }),
  });
}

export function useUseQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => api.post(`/quick-replies/${id}/use`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quick-replies'] }),
  });
}
