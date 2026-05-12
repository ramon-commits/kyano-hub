import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function useNudges(minDays) {
  const qs = minDays != null ? `?min_days=${minDays}` : '';
  return useQuery({
    queryKey: ['nudges', minDays],
    queryFn: () => api.get(`/contacts/nudges${qs}`),
  });
}

export function useContact(id) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: () => api.get(`/contacts/${id}`),
    enabled: !!id,
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }) => api.patch(`/contacts/${id}`, patch),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['contact', vars.id] });
      qc.invalidateQueries({ queryKey: ['birthdays'] });
      qc.invalidateQueries({ queryKey: ['nudges'] });
    },
  });
}

export function useUpdateNudgeSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, remind_after_days, is_active }) =>
      api.patch(`/contacts/${id}/nudge-settings`, { remind_after_days, is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nudges'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['daily-summary'] });
    },
  });
}
