/** Date helpers for the calendar board (local time, weeks start on Monday). */
export const DAY_MS = 86_400_000;

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
/** Monday of the week containing `d`. */
export function startOfWeek(d) {
  const x = startOfDay(d);
  return addDays(x, -((x.getDay() + 6) % 7));
}
/** The 7 days of `d`'s week. */
export const weekDays = (d) => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(d), i));
/** 6 weeks × 7 days covering `d`'s month, starting on a Monday. */
export function monthGrid(d) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
/** Range [from, to) to load for a view. */
export function rangeFor(view, anchor) {
  if (view === 'month') {
    const days = monthGrid(anchor);
    return [days[0], addDays(days[41], 1)];
  }
  if (view === 'list') {
    const from = startOfDay(anchor);
    return [from, addDays(from, 28)];
  }
  const from = startOfWeek(anchor);
  return [from, addDays(from, 7)];
}
/** `startAt` moved to `day`, keeping the time of day. */
export function moveToDay(startAt, day) {
  const s = new Date(startAt);
  const x = new Date(day);
  x.setHours(s.getHours(), s.getMinutes(), s.getSeconds(), 0);
  return x;
}
/** Shifts the anchor date one step for a view. */
export function step(view, anchor, dir) {
  if (view === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  return addDays(anchor, (view === 'list' ? 28 : 7) * dir);
}

/** Pastel tile per event type. */
export function toneFor(type = '') {
  if (/lab/i.test(type)) return 'tile-green';
  if (/quiz/i.test(type)) return 'tile-lavender';
  if (/assignment|deadline/i.test(type)) return 'tile-yellow';
  if (/cie|test|exam/i.test(type)) return 'tile-lime';
  if (/announce/i.test(type)) return 'tile-pink';
  return 'bg-surface-2 text-fg';
}
export const TYPE_LEGEND = [
  ['Quiz', 'tile-lavender'],
  ['Lab', 'tile-green'],
  ['Assignment deadline', 'tile-yellow'],
  ['CIE', 'tile-lime'],
  ['Announcement', 'tile-pink'],
];

/** Groups events by local day key "YYYY-MM-DD". */
export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export function byDay(events) {
  const m = new Map();
  for (const e of events) {
    const k = dayKey(e.startAt);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e);
  }
  for (const list of m.values()) list.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  return m;
}

/** "yyyy-MM-ddTHH:mm" for <input type="datetime-local">. */
export const toLocalInput = (d) => {
  const x = new Date(d);
  return `${dayKey(x)}T${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
};
