import { describe, expect, it } from 'vitest';
import { byDay, dayKey, monthGrid, moveToDay, rangeFor, startOfWeek, step, toneFor, weekDays } from '../lib/calendar.js';

describe('calendar helpers', () => {
  it('weeks start on Monday', () => {
    const sunday = new Date(2026, 10, 22, 15, 0); // Sun 22 Nov 2026
    expect(startOfWeek(sunday).getDate()).toBe(16);
    expect(weekDays(sunday).map((d) => d.getDay())).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('builds a 6-week month grid starting on Monday', () => {
    const grid = monthGrid(new Date(2026, 10, 15));
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(1);
    expect(grid.some((d) => d.getMonth() === 10 && d.getDate() === 1)).toBe(true);
  });

  it('moves an event to another day keeping its time', () => {
    const moved = moveToDay(new Date(2026, 10, 20, 10, 30), new Date(2026, 10, 26));
    expect([moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([26, 10, 30]);
  });

  it('loads the right ranges and steps', () => {
    const [from, to] = rangeFor('week', new Date(2026, 10, 22));
    expect((to - from) / 86_400_000).toBe(7);
    expect(step('month', new Date(2026, 10, 22), 1).getMonth()).toBe(11);
    expect(step('week', new Date(2026, 10, 22), -1).getDate()).toBe(15);
  });

  it('groups by local day and picks tile colours by type', () => {
    const m = byDay([
      { startAt: new Date(2026, 10, 20, 14).toISOString() },
      { startAt: new Date(2026, 10, 20, 9).toISOString() },
    ]);
    const list = m.get(dayKey(new Date(2026, 10, 20)));
    expect(new Date(list[0].startAt).getHours()).toBe(9);
    expect(toneFor('Quiz')).toBe('tile-lavender');
    expect(toneFor('Assignment deadline')).toBe('tile-yellow');
    expect(toneFor('Holiday')).toContain('bg-surface-2');
  });
});

describe('multi-day events', async () => {
  const { spanDays, isMultiDay, kindOf } = await import('../lib/calendar.js');
  const cie = { startAt: new Date(2026, 9, 14, 0, 0).toISOString(), endAt: new Date(2026, 9, 16, 23, 59, 59).toISOString(), allDay: true, type: 'CIE' };

  it('spans every covered day', () => {
    expect(isMultiDay(cie)).toBe(true);
    expect(spanDays(cie)).toBe(3);
    const m = byDay([cie]);
    expect([15, 16].map((d) => m.get(dayKey(new Date(2026, 9, d)))[0].seg)).toEqual([
      { index: 1, total: 3 },
      { index: 2, total: 3 },
    ]);
    const single = { startAt: new Date(2026, 9, 27, 0, 0).toISOString(), endAt: new Date(2026, 9, 27, 23, 59, 59).toISOString(), allDay: true };
    expect(spanDays(single)).toBe(1);
  });

  it('maps types to legend kinds', () => {
    expect(kindOf('Assignment deadline')).toBe('Deadline');
    expect(kindOf('Exam')).toBe('Exam');
    expect(kindOf('Review')).toBe('Review');
    expect(kindOf('Academic date')).toBe('Other');
  });
});
