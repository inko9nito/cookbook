import { describe, expect, test } from 'vitest';
import { addDays, dayName, dayOf, daysBetween, Planned, plannedOn, upcomingDaysOf, weekDays, weekName, weekRange, weekStart, type Planned as P } from './planner';

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
