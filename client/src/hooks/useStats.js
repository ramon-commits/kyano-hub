import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get('/stats'),
    refetchInterval: 30000,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.health(),
    refetchInterval: 15000,
    retry: 1,
  });
}

export function useDailySummary() {
  return useQuery({
    queryKey: ['daily-summary'],
    queryFn: () => api.get('/stats/daily-summary'),
    staleTime: 5 * 60 * 1000, // 5 min
  });
}
