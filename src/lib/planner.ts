// The Planner (issue #62): which recipes are planned for which days. Not meal plans (#26, reusable templates with
// numbered days): these are real dates. Shared by the app and the API (netlify/functions). A planned recipe holds the
// recipe's id, never its data (CLAUDE.md data rules): the app looks the recipe up, and deleting a recipe takes it off
// every day (the database does that).

import { z } from 'zod';

const id = z.string().min(1).max(64);

/** A day as YYYY-MM-DD: the phone's own calendar day, with no time or time zone, so it never shifts a day. */
export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'should be a day like 2026-11-17');
export type Day = z.infer<typeof Day>;

/** A day's meal slots (issue #67), in the order they show. A planned item without one is for the day as a whole. */
export const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export type Meal = (typeof MEALS)[number];
export const mealName = (m: Meal) => m[0].toUpperCase() + m.slice(1);

/** Something planned for a day: a recipe (by id) or a note ("Eating out"), either one, never both. */
export const Planned = z
  .object({
    id,
    day: Day,
    recipeId: id.optional(),
    note: z.string().trim().min(1).max(500).optional(),
    meal: z.enum(MEALS).optional(),
    /** issue #67: the servings picked on the recipe page when it was added; none: the recipe's own */
    servings: z.number().positive().max(1000).optional(),
    /** ISO timestamp. Within a slot, items show in the order they were added. */
    createdAt: z.string(),
  })
  .refine((p) => !p.recipeId !== !p.note, { message: 'needs a recipe or a note, not both' });
export type Planned = z.infer<typeof Planned>;

// ── days ──

const pad = (n: number) => String(n).padStart(2, '0');

/** The calendar day of a Date on this phone. */
export const dayOf = (d: Date): Day => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Today on this phone. */
export const today = (): Day => dayOf(new Date());

/** A day as a Date at local midnight (for Intl and Framework7's Calendar). */
export const dateOf = (day: Day): Date => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (day: Day, n: number): Day => {
  const d = dateOf(day);
  d.setDate(d.getDate() + n);
  return dayOf(d);
};

/** Whole days from one day to another (negative when `to` is earlier). */
export const daysBetween = (from: Day, to: Day): number => Math.round((dateOf(to).getTime() - dateOf(from).getTime()) / 86_400_000);

/** Weeks start on Monday, as in Prepear's planner ("Nov 9 – Nov 15"). */
export const weekStart = (day: Day): Day => addDays(day, -((dateOf(day).getDay() + 6) % 7));

/** The seven days of the week that starts on `start`. */
export const weekDays = (start: Day): Day[] => Array.from({ length: 7 }, (_, i) => addDays(start, i));

const fmt = (day: Day, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', options).format(dateOf(day));

/** "Nov 18" */
export const shortDate = (day: Day) => fmt(day, { month: 'short', day: 'numeric' });
/** "Wednesday" */
export const weekdayName = (day: Day) => fmt(day, { weekday: 'long' });
/** "W" (the strip's letter) */
export const weekdayLetter = (day: Day) => fmt(day, { weekday: 'narrow' });
/** "Wed, Nov 18" */
export const mediumDate = (day: Day) => fmt(day, { weekday: 'short', month: 'short', day: 'numeric' });

/** A day's name as it reads in the agenda: Today, Tomorrow, Yesterday, else the weekday ("Wednesday"). */
export function dayName(day: Day, now: Day): string {
  const n = daysBetween(now, day);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return weekdayName(day);
}

/** "Nov 16 – 22", or "Nov 30 – Dec 6" across a month, with the year when it isn't this year's. */
export function weekRange(start: Day, now: Day): string {
  const end = addDays(start, 6);
  const year = start.slice(0, 4) !== now.slice(0, 4) || end.slice(0, 4) !== now.slice(0, 4) ? `, ${end.slice(0, 4)}` : '';
  const last = start.slice(0, 7) === end.slice(0, 7) ? String(dateOf(end).getDate()) : shortDate(end);
  return `${shortDate(start)} – ${last}${year}`;
}

/** "This week", "Next week" or "Last week" for the weeks next to today's; nothing for the others. */
export function weekName(start: Day, now: Day): string | undefined {
  const n = daysBetween(weekStart(now), start) / 7;
  return n === 0 ? 'This week' : n === 1 ? 'Next week' : n === -1 ? 'Last week' : undefined;
}

// ── planned recipes ──

const byAdded = (a: Planned, b: Planned) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** A day's planned items, in the order they were added. */
export const plannedOn = (list: Planned[], day: Day) => list.filter((p) => p.day === day).sort(byAdded);

/**
 * A day's items by slot: those for the day as a whole first (no label), then Breakfast, Lunch and Dinner, each in the
 * order added. Empty slots are left out.
 */
export const slotsOn = (list: Planned[], day: Day): { meal: Meal | null; items: Planned[] }[] => {
  const items = plannedOn(list, day);
  return [null, ...MEALS]
    .map((meal) => ({ meal, items: items.filter((p) => (p.meal ?? null) === meal) }))
    .filter((s) => s.items.length);
};

/** The days that have something planned. */
export const busyDays = (list: Planned[]) => new Set(list.map((p) => p.day));

/** The days a recipe is planned for from today on, soonest first (each day once). Notes have no recipe. */
export const upcomingDaysOf = (list: Planned[], recipeId: string, now: Day): Day[] =>
  [...new Set(list.filter((p) => p.recipeId === recipeId && p.day >= now).map((p) => p.day))].sort();

type PlanOptions = { meal?: Meal; servings?: number; place?: number };
const withOptions = ({ meal, servings }: PlanOptions) => ({ ...(meal ? { meal } : {}), ...(servings ? { servings } : {}) });

/** A new planned recipe. Several added at once pass their place (0, 1, 2…), so they keep that order on the day. */
export const plan = (recipeId: string, day: Day, newId: () => string, options: PlanOptions = {}): Planned => ({
  id: newId(),
  day,
  recipeId,
  ...withOptions(options),
  createdAt: new Date(Date.now() + (options.place ?? 0)).toISOString(),
});

/** A new note for a day ("Eating out", "Leftovers"). */
export const planNote = (note: string, day: Day, newId: () => string, meal?: Meal): Planned => ({
  id: newId(),
  day,
  note: note.trim(),
  ...withOptions({ meal }),
  createdAt: new Date().toISOString(),
});

/** The same item in another slot (null: for the day as a whole). */
export const inMeal = (p: Planned, meal: Meal | null): Planned => {
  const { meal: _old, ...rest } = p;
  return meal ? { ...rest, meal } : rest;
};
