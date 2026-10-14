import { format, parseISO } from 'date-fns';

export function formatMoney(amount, currency) {
  if (amount === null || amount === undefined || amount === '') return '';
  const value = Number(amount).toLocaleString('en-US');
  return currency === 'USD' ? `$${value}` : `${currency} ${value}`;
}

export function formatDuration(minutes) {
  const total = Number(minutes) || 0;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins}m`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

export function formatDateShort(iso) {
  if (!iso) return '';
  return format(parseISO(iso), 'EEE, d MMM');
}

export function formatDateFull(iso) {
  if (!iso) return '';
  return format(parseISO(iso), 'EEEE d MMMM yyyy');
}

export function formatDateTime(iso) {
  if (!iso) return '';
  return format(new Date(iso), 'd MMM yyyy, HH:mm');
}

export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}