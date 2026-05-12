import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useContacts(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, v);
  return useQuery({
    queryKey: ['contacts', params],
    queryFn: () => api.get(`/contacts${qs.size ? `?${qs}` : ''}`),
  });
}

export function useBirthdays(withinDays = 30) {
  return useQuery({
    queryKey: ['birthdays', withinDays],
    queryFn: () => api.get(`/contacts/birthdays?within_days=${withinDays}`),
  });
}

export function useNudges() {
  return useQuery({
    queryKey: ['nudges'],
    queryFn: () => api.get('/contacts/nudges'),
  });
}
