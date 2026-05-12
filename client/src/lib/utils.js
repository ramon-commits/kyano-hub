export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function timeAgo(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? parseDateSafe(date) : date;
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'nu';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}u`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(day / 365)}j`;
}

const MONTHS_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MONTHS_NL_LONG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

export function parseDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  // SQLite "YYYY-MM-DD HH:MM:SS" -> treat as UTC
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
    return new Date(value.replace(' ', 'T') + 'Z');
  }
  return new Date(value);
}

export function formatDate(date) {
  const d = parseDateSafe(date);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS_NL_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateShort(date) {
  const d = parseDateSafe(date);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS_NL[d.getMonth()]}`;
}

export function formatTime(date) {
  const d = parseDateSafe(date);
  if (!d) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDateTime(date) {
  return `${formatDate(date)} ${formatTime(date)}`;
}

export function isSameDay(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function getDaysUntilBirthday(birthday) {
  if (!birthday) return null;
  const [, m, d] = birthday.split('-').map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next < today) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((next - today) / 86400000);
}

export function getDaysSinceContact(lastContactDate) {
  if (!lastContactDate) return null;
  const d = parseDateSafe(lastContactDate);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function groupByDate(items, getDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekStart = new Date(today.getTime() - 6 * 86400000);

  const groups = { vandaag: [], gisteren: [], deze_week: [], eerder: [] };
  for (const item of items) {
    const d = parseDateSafe(getDate(item));
    if (!d) { groups.eerder.push(item); continue; }
    if (isSameDay(d, today)) groups.vandaag.push(item);
    else if (isSameDay(d, yesterday)) groups.gisteren.push(item);
    else if (d >= weekStart) groups.deze_week.push(item);
    else groups.eerder.push(item);
  }
  return groups;
}

export function nextMondayAt9() {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMon = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMon);
  d.setHours(9, 0, 0, 0);
  return d;
}

export function tomorrowAt9() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

export function daysFromNowAt9(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d;
}

export function toISO(date) {
  return date.toISOString();
}

export function toDateInputValue(date) {
  const d = parseDateSafe(date) || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toTimeInputValue(date) {
  const d = parseDateSafe(date) || new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
