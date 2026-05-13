import { tomorrowAt9, daysFromNowAt9, nextMondayAt9 } from './utils.js';

export const CHANNEL_COLORS = {
  email:     { bg: '#fef2f2', text: '#dc2626', icon: 'envelope',  brand: false, label: 'Email' },
  whatsapp:  { bg: '#f0fdf4', text: '#16a34a', icon: 'whatsapp',  brand: true,  label: 'WhatsApp' },
  instagram: { bg: '#fdf2f8', text: '#ec4899', icon: 'instagram', brand: true,  label: 'Instagram' },
  linkedin:  { bg: '#eff6ff', text: '#3b82f6', icon: 'linkedin',  brand: true,  label: 'LinkedIn' },
};

export const PRIORITY_COLORS = {
  high:   { bg: '#fef2f2', text: '#dc2626', label: 'Urgent',  dot: '#dc2626' },
  medium: { bg: '#fff7ed', text: '#ea580c', label: 'Normaal', dot: '#ea580c' },
  low:    { bg: '#f0fdf4', text: '#16a34a', label: 'Laag',    dot: '#16a34a' },
};

export const STATUS_COLORS = {
  open:     { bg: '#eff6ff', text: '#3b82f6', label: 'Open' },
  snoozed:  { bg: '#fff7ed', text: '#ea580c', label: 'Snoozed' },
  done:     { bg: '#f0fdf4', text: '#16a34a', label: 'Afgehandeld' },
  waiting:  { bg: '#fef3c7', text: '#a16207', label: 'Wacht op reactie' },
  archived: { bg: '#f3f4f6', text: '#6b7280', label: 'Gearchiveerd' },
};

export const SNOOZE_OPTIONS = [
  { id: 'tomorrow',    label: 'Morgen ochtend',  sublabel: '9:00',         icon: 'sun',           getDate: () => tomorrowAt9() },
  { id: 'day-after',   label: 'Overmorgen',      sublabel: '9:00',         icon: 'calendar-day',  getDate: () => daysFromNowAt9(2) },
  { id: 'three-days',  label: 'Over 3 dagen',    sublabel: '9:00',         icon: 'calendar-week', getDate: () => daysFromNowAt9(3) },
  { id: 'next-week',   label: 'Volgende week',   sublabel: 'maandag 9:00', icon: 'calendar-days', getDate: () => nextMondayAt9() },
  { id: 'next-month',  label: 'Volgende maand',  sublabel: '+30 dagen',    icon: 'calendar',      getDate: () => daysFromNowAt9(30) },
];

export const DONE_CATEGORIES = [
  { value: 'replied',      label: 'Beantwoord',        icon: 'reply',           color: '#16a34a' },
  { value: 'called',       label: 'Gebeld',            icon: 'phone',           color: '#3b82f6' },
  { value: 'offer_sent',   label: 'Offerte verstuurd', icon: 'file-invoice',    color: '#8b5cf6' },
  { value: 'forwarded',    label: 'Doorgestuurd',      icon: 'share-from-square',color: '#ea580c' },
  { value: 'not_relevant', label: 'Niet relevant',     icon: 'ban',             color: '#6b7280' },
  { value: 'other',        label: 'Anders',            icon: 'note-sticky',     color: '#0ea5e9' },
];

export const NAV_ITEMS = [
  { id: 'inbox',        icon: 'inbox',          label: 'Inbox',         badgeKey: 'open_count',     shortcut: '1' },
  { id: 'snoozed',      icon: 'clock',          label: 'Snoozed',       badgeKey: 'snoozed_count',  shortcut: '2' },
  { id: 'logboek',      icon: 'clipboard-list', label: 'Logboek',                                   shortcut: '3' },
  { id: 'contacten',    icon: 'address-book',   label: 'Contacten',                                 shortcut: '4' },
  { id: 'verjaardagen', icon: 'cake-candles',   label: 'Verjaardagen',  badgeKey: 'birthdays_week', shortcut: '5' },
  { id: 'nudges',       icon: 'bell',           label: 'Nudges',        badgeKey: 'nudges_count',   shortcut: '6' },
  { id: 'calendar',     icon: 'calendar-days',  label: 'Calendar',                                  shortcut: '7' },
  { id: 'projecten',    icon: 'folder-open',    label: 'Projecten',                                 shortcut: '8' },
  { id: 'analytics',    icon: 'chart-line',     label: 'Analytics',                                 shortcut: '9' },
  { id: 'vraag',        icon: 'robot',          label: 'Vraag (AI)' },
  { id: 'instellingen', icon: 'gear',           label: 'Instellingen' },
];

// Sidebar groepering — items in volgorde van NAV_ITEMS.id
export const NAV_GROUPS = [
  { label: 'COMMUNICATIE', items: ['inbox', 'snoozed', 'logboek'] },
  { label: 'RELATIES',     items: ['contacten', 'verjaardagen', 'nudges'] },
  { label: 'PLANNING',     items: ['calendar', 'projecten'] },
  { label: 'AI & TOOLS',   items: ['analytics', 'vraag', 'instellingen'] },
];

// Status pillen voor contact-CRM
export const CONTACT_STATUS = [
  { value: 'lead',       label: 'Lead',       color: '#3b82f6', bg: '#eff6ff' },
  { value: 'klant',      label: 'Klant',      color: '#16a34a', bg: '#f0fdf4' },
  { value: 'partner',    label: 'Partner',    color: '#8b5cf6', bg: '#f5f3ff' },
  { value: 'leverancier',label: 'Leverancier',color: '#ea580c', bg: '#fff7ed' },
  { value: 'vriend',     label: 'Vriend',     color: '#ec4899', bg: '#fdf2f8' },
  { value: 'overig',     label: 'Overig',     color: '#6b7280', bg: '#f3f4f6' },
];
