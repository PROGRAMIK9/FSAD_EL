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
