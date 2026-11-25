import { describe, expect, test } from 'vitest';
import { addDays, dayName, dayOf, daysBetween, inMeal, onDay, Planned, plan, planNote, plannedOn, reorder, slotsOn, upcomingDaysOf, weekDays, weekName, weekRange, weekStart, type Planned as P } from './planner';

const p = (id: string, day: string, recipeId: string, createdAt: string): P => ({ id, day, recipeId, createdAt });

describe('days', () => {
  test('a day is the phone’s calendar day', () => {
    expect(dayOf(new Date(2026, 10, 17, 23, 59))).toBe('2026-11-17');
    expect(dayOf(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });

  test('adding days crosses months, years and clock changes', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    // US clocks go back on Nov 1, 2026 and forward on Mar 8, 2026
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });

  test('weeks start on Monday', () => {
    expect(weekStart('2026-11-17')).toBe('2026-11-16'); // a Tuesday
    expect(weekStart('2026-11-16')).toBe('2026-11-16'); // the Monday itself
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // the Sunday after
    expect(weekDays('2026-11-30')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']);
  });

  test('names: Today, Tomorrow, Yesterday, else the weekday', () => {
    expect(dayName('2026-11-17', '2026-11-17')).toBe('Today');
    expect(dayName('2026-11-18', '2026-11-17')).toBe('Tomorrow');
    expect(dayName('2026-11-16', '2026-11-17')).toBe('Yesterday');
    expect(dayName('2026-11-20', '2026-11-17')).toBe('Friday');
  });

  test('a week reads as a range, with the year only when it isn’t this one', () => {
    expect(weekRange('2026-11-16', '2026-11-17')).toBe('Nov 16 – 22');
    expect(weekRange('2026-11-30', '2026-11-17')).toBe('Nov 30 – Dec 6');
    expect(weekRange('2026-12-28', '2026-11-17')).toBe('Dec 28 – Jan 3, 2027');
    expect(weekName('2026-11-16', '2026-11-17')).toBe('This week');
    expect(weekName('2026-11-23', '2026-11-17')).toBe('Next week');
    expect(weekName('2026-11-09', '2026-11-17')).toBe('Last week');
    expect(weekName('2026-11-30', '2026-11-17')).toBeUndefined();
  });
});

describe('planned recipes', () => {
  const list = [
    p('a', '2026-11-18', 'r1', '2026-11-17T10:00:02.000Z'),
    p('b', '2026-11-18', 'r2', '2026-11-17T10:00:01.000Z'),
    p('c', '2026-11-16', 'r1', '2026-11-15T10:00:00.000Z'),
    p('d', '2026-11-21', 'r1', '2026-11-17T09:00:00.000Z'),
    p('e', '2026-11-21', 'r1', '2026-11-17T09:00:01.000Z'),
  ];

  test('a day’s recipes, in the order they were added', () => {
    expect(plannedOn(list, '2026-11-18').map((x) => x.id)).toEqual(['b', 'a']);
    expect(plannedOn(list, '2026-11-19')).toEqual([]);
  });

  test('the days a recipe is planned for from today on, each once', () => {
    expect(upcomingDaysOf(list, 'r1', '2026-11-17')).toEqual(['2026-11-18', '2026-11-21']);
  });

  test('a day must be a calendar day', () => {
    expect(Planned.safeParse(p('x', '2026-11-18', 'r1', '2026-11-17T10:00:00.000Z')).success).toBe(true);
    expect(Planned.safeParse(p('x', '2026-11-18T00:00:00Z', 'r1', '2026-11-17T10:00:00.000Z')).success).toBe(false);
  });
});

describe('meal slots and notes (issue #67)', () => {
  const list: P[] = [
    { id: 'd', day: '2026-11-18', recipeId: 'r1', meal: 'dinner', createdAt: '2026-11-17T10:00:00.000Z' },
    { id: 'n', day: '2026-11-18', note: 'Eating out', meal: 'lunch', createdAt: '2026-11-17T10:00:01.000Z' },
    { id: 'a', day: '2026-11-18', recipeId: 'r2', createdAt: '2026-11-17T10:00:02.000Z' },
    { id: 'b', day: '2026-11-18', recipeId: 'r3', meal: 'breakfast', createdAt: '2026-11-17T10:00:03.000Z' },
  ];

  test('a day by slot: the whole day first, then breakfast, lunch, dinner; empty slots left out', () => {
    expect(slotsOn(list, '2026-11-18').map((s) => [s.meal, s.items.map((p) => p.id)])).toEqual([
      [null, ['a']],
      ['breakfast', ['b']],
      ['lunch', ['n']],
      ['dinner', ['d']],
    ]);
    expect(slotsOn(list, '2026-11-19')).toEqual([]);
  });

  test('a recipe or a note, never both or neither', () => {
    const base = { id: 'x', day: '2026-11-18', createdAt: '2026-11-17T10:00:00.000Z' };
    expect(Planned.safeParse({ ...base, note: 'Leftovers', meal: 'dinner' }).success).toBe(true);
    expect(Planned.safeParse({ ...base, recipeId: 'r1', servings: 6 }).success).toBe(true);
    expect(Planned.safeParse({ ...base, recipeId: 'r1', note: 'and this' }).success).toBe(false);
    expect(Planned.safeParse(base).success).toBe(false);
    expect(Planned.safeParse({ ...base, recipeId: 'r1', meal: 'brunch' }).success).toBe(false);
  });

  test('new items keep their slot and servings; moving to another slot', () => {
    const p = plan('r1', '2026-11-18', () => 'id1', { meal: 'dinner', servings: 6 });
    expect(p).toMatchObject({ id: 'id1', recipeId: 'r1', meal: 'dinner', servings: 6 });
    expect(plan('r1', '2026-11-18', () => 'id2')).not.toHaveProperty('servings');
    expect(planNote('  Eating out ', '2026-11-18', () => 'id3')).toMatchObject({ note: 'Eating out' });
    expect(inMeal(p, 'lunch').meal).toBe('lunch');
    expect(inMeal(p, null)).not.toHaveProperty('meal');
  });
});

describe('putting a slot in order by dragging (issue #164)', () => {
  const day = '2026-11-18';
  const list: P[] = [
    p('a', day, 'r1', '2026-11-17T10:00:00.000Z'),
    p('b', day, 'r2', '2026-11-17T10:00:01.000Z'),
    p('c', day, 'r3', '2026-11-17T10:00:02.000Z'),
  ];

  test('a dragged row takes its place; every row in the slot keeps one, and only the changed ones are saved', () => {
    const changed = reorder(plannedOn(list, day), 2, 0);
    expect(changed.map((x) => [x.id, x.position])).toEqual([['c', 0], ['a', 1], ['b', 2]]);
    const after = list.map((x) => changed.find((c) => c.id === x.id) ?? x);
    expect(plannedOn(after, day).map((x) => x.id)).toEqual(['c', 'a', 'b']);
    // dragging again saves only what moved
    expect(reorder(plannedOn(after, day), 1, 2).map((x) => [x.id, x.position])).toEqual([['b', 1], ['a', 2]]);
    expect(reorder(plannedOn(after, day), 5, 0)).toEqual([]);
  });

  test('items added after the slot was put in order go at the end, in the order added', () => {
    const placed = [{ ...list[1], position: 0 }, { ...list[0], position: 1 }, p('d', day, 'r4', '2026-11-16T10:00:00.000Z'), list[2]];
    expect(plannedOn(placed, day).map((x) => x.id)).toEqual(['b', 'a', 'd', 'c']);
    expect(slotsOn(placed, day)[0].items.map((x) => x.id)).toEqual(['b', 'a', 'd', 'c']);
  });

  test('moved to another slot or day, an item leaves its place behind and goes at the end there', () => {
    const placed = { ...list[0], position: 0, meal: 'lunch' as const };
    expect(inMeal(placed, 'dinner')).toEqual({ ...list[0], meal: 'dinner' });
    expect(onDay(placed, '2026-11-19')).toEqual({ ...list[0], meal: 'lunch', day: '2026-11-19' });
  });
});
