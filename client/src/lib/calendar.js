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

/** Event kinds: legend label, tile classes and the types they cover. */
export const TYPE_LEGEND = [
  ['Quiz', 'tile-lavender', /quiz/i],
  ['Lab', 'tile-green', /lab/i],
  ['CIE', 'tile-lime', /cie|test/i],
  ['Exam', 'tile-pink', /exam|hall ticket/i],
  ['Deadline', 'tile-yellow', /deadline|assignment/i],
  ['Review', 'bg-surface text-fg ring-2 ring-inset ring-tile-green', /review|internship|counsel/i],
  ['Other', 'bg-surface-2 text-fg', /.*/],
];
/** Legend kind of a type ("Assignment deadline" → "Deadline"). */
export const kindOf = (type = '') => TYPE_LEGEND.find(([, , re]) => re.test(type))[0];
/** Tile classes per event type. */
export const toneFor = (type = '') => TYPE_LEGEND.find(([, , re]) => re.test(type))[1];

/** True when the event covers more than one calendar day. */
export const isMultiDay = (e) => Boolean(e.endAt) && !sameDay(e.startAt, new Date(new Date(e.endAt).getTime() - 1));
/** Number of calendar days an event covers (1 for single-day events). */
export const spanDays = (e) => (isMultiDay(e) ? Math.round((startOfDay(new Date(new Date(e.endAt).getTime() - 1)) - startOfDay(e.startAt)) / DAY_MS) + 1 : 1);

/** Groups events by local day key "YYYY-MM-DD". */
export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
/**
 * Groups events by local day. Multi-day events appear on every day they cover (at most 62), as
 * copies with `seg: { index, total }` (index 0 is the first day).
 */
export function byDay(events) {
  const m = new Map();
  const put = (k, e) => {
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e);
  };
  for (const e of events) {
    const total = spanDays(e);
    if (total === 1) put(dayKey(e.startAt), e);
    else for (let i = 0; i < Math.min(total, 62); i++) put(dayKey(addDays(startOfDay(e.startAt), i)), { ...e, seg: { index: i, total } });
  }
  // Multi-day and all-day entries first, then by time.
  const rank = (e) => (e.seg ? 0 : e.allDay ? 1 : 2);
  for (const list of m.values()) list.sort((a, b) => rank(a) - rank(b) || new Date(a.startAt) - new Date(b.startAt));
  return m;
}

/** "yyyy-MM-ddTHH:mm" for <input type="datetime-local">. */
export const toLocalInput = (d) => {
  const x = new Date(d);
  return `${dayKey(x)}T${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
};
