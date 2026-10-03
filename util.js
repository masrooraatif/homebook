export const pad = (n) => String(n).padStart(2, '0');
export const num = (v) => Number(v ?? 0);

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function today() {
  return `${currentMonth()}-${pad(new Date().getDate())}`;
}
export function addMonths(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}
export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
/** [inclusive start, exclusive end] as 'YYYY-MM-DD' strings. */
export function monthRange(month) {
  return [`${month}-01`, `${addMonths(month, 1)}-01`];
}
export function isMonth(s) {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}
export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
