import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useChannels() {
  return useQuery({
    queryKey: ['channels'],
    queryFn: () => api.get('/channels'),
  });
}

export function useAuthStatus() {
  return useQuery({
    queryKey: ['auth-status'],
    queryFn: () => api.get('/auth/status'),
  });
}
