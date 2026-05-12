import { tomorrowAt9, daysFromNowAt9, nextMondayAt9 } from './utils.js';

export const CHANNEL_COLORS = {
  email: { bg: '#fef2f2', text: '#dc2626', icon: '✉️', label: 'Email' },
  whatsapp: { bg: '#f0fdf4', text: '#16a34a', icon: '💬', label: 'WhatsApp' },
  instagram: { bg: '#fdf2f8', text: '#ec4899', icon: '📸', label: 'Instagram' },
  linkedin: { bg: '#eff6ff', text: '#3b82f6', icon: '💼', label: 'LinkedIn' },
};

export const PRIORITY_COLORS = {
  high: { bg: '#fef2f2', text: '#dc2626', label: 'Urgent', dot: '#dc2626' },
  medium: { bg: '#fff7ed', text: '#ea580c', label: 'Normaal', dot: '#ea580c' },
  low: { bg: '#f0fdf4', text: '#16a34a', label: 'Laag', dot: '#16a34a' },
};

export const STATUS_COLORS = {
  open: { bg: '#eff6ff', text: '#3b82f6', label: 'Open' },
  snoozed: { bg: '#fff7ed', text: '#ea580c', label: 'Snoozed' },
  done: { bg: '#f0fdf4', text: '#16a34a', label: 'Afgehandeld' },
  waiting: { bg: '#fef3c7', text: '#a16207', label: 'Wacht op reactie' },
  archived: { bg: '#f3f4f6', text: '#6b7280', label: 'Gearchiveerd' },
};

export const SNOOZE_OPTIONS = [
  { id: 'tomorrow', label: 'Morgen ochtend', sublabel: '9:00', icon: '🌅', getDate: () => tomorrowAt9() },
  { id: 'day-after', label: 'Overmorgen', sublabel: '9:00', icon: '📅', getDate: () => daysFromNowAt9(2) },
  { id: 'three-days', label: 'Over 3 dagen', sublabel: '9:00', icon: '📆', getDate: () => daysFromNowAt9(3) },
  { id: 'next-week', label: 'Volgende week', sublabel: 'maandag 9:00', icon: '🗓️', getDate: () => nextMondayAt9() },
  { id: 'next-month', label: 'Volgende maand', sublabel: '+30 dagen', icon: '📋', getDate: () => daysFromNowAt9(30) },
];

export const DONE_CATEGORIES = [
  { value: 'replied', label: 'Beantwoord', icon: '💬', color: '#16a34a' },
  { value: 'called', label: 'Gebeld', icon: '📞', color: '#3b82f6' },
  { value: 'offer_sent', label: 'Offerte verstuurd', icon: '📄', color: '#8b5cf6' },
  { value: 'forwarded', label: 'Doorgestuurd', icon: '↗️', color: '#ea580c' },
  { value: 'not_relevant', label: 'Niet relevant', icon: '🚫', color: '#6b7280' },
  { value: 'other', label: 'Anders', icon: '📝', color: '#0ea5e9' },
];

export const NAV_ITEMS = [
  { id: 'inbox', icon: '📬', label: 'Inbox', badgeKey: 'open_count', shortcut: '1' },
  { id: 'snoozed', icon: '⏰', label: 'Snoozed', badgeKey: 'snoozed_count', shortcut: '2' },
  { id: 'logboek', icon: '📋', label: 'Logboek', shortcut: '3' },
  { id: 'contacten', icon: '👥', label: 'Contacten', shortcut: '4' },
  { id: 'verjaardagen', icon: '🎂', label: 'Verjaardagen', badgeKey: 'birthdays_week', shortcut: '5' },
  { id: 'nudges', icon: '💡', label: 'Nudges', badgeKey: 'nudges_count', shortcut: '6' },
  { id: 'calendar', icon: '📅', label: 'Calendar', shortcut: '7' },
  { id: 'projecten', icon: '🗂️', label: 'Projecten', shortcut: '8' },
  { id: 'analytics', icon: '📊', label: 'Analytics', shortcut: '9' },
  { id: 'vraag', icon: '💬', label: 'Vraag (AI)' },
  { id: 'instellingen', icon: '⚙️', label: 'Instellingen' },
];
