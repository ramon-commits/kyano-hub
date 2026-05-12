import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useCalendarEvents(from, to) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return useQuery({
    queryKey: ['calendar-events', from, to],
    queryFn: () => api.get(`/calendar/events${qs.size ? '?' + qs : ''}`),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useCalendarToday() {
  return useQuery({
    queryKey: ['calendar-today'],
    queryFn: () => api.get('/calendar/today'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.post('/calendar/events', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      qc.invalidateQueries({ queryKey: ['calendar-today'] });
    },
  });
}
