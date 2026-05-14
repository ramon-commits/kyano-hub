import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useSocialPosts(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, v);
  return useQuery({
    queryKey: ['social-posts', params],
    queryFn: () => api.get(`/social/posts${qs.size ? `?${qs}` : ''}`),
    staleTime: 30 * 1000,
  });
}

export function useCreateSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post('/social/posts', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-posts'] }),
  });
}

export function useUpdateSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }) => api.patch(`/social/posts/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-posts'] }),
  });
}

export function useDeleteSocialPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/social/posts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social-posts'] }),
  });
}
