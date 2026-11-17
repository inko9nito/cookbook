// Reading and writing the Planner (issues #62, #67) in Netlify Database. netlify/functions/planner.mts calls these; the
// tests (planner.test.ts) run them against a local database.

import type { getDatabase } from '@netlify/database';
import { Planned } from '../../src/lib/planner';

type Sql = ReturnType<typeof getDatabase>['sql'];

// the day comes back as text, so no time zone can move it to the day before
type Row = {
  id: string;
  day: string;
  recipe_id: string | null;
  note: string | null;
  meal: Planned['meal'] | null;
  servings: string | number | null;
  created_at: Date | string;
};

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());
const toPlanned = (r: Row): Planned => ({
  id: r.id,
  day: r.day,
  ...(r.recipe_id ? { recipeId: r.recipe_id } : {}),
  ...(r.note ? { note: r.note } : {}),
  ...(r.meal ? { meal: r.meal } : {}),
  ...(r.servings != null ? { servings: Number(r.servings) } : {}),
  createdAt: iso(r.created_at),
});

/** Everything planned, by day, then in the order added. */
export async function listPlanned(sql: Sql): Promise<Planned[]> {
  const rows = await sql<Row>`
    SELECT id, to_char(day, 'YYYY-MM-DD') AS day, recipe_id, note, meal, servings, created_at
    FROM planned_recipes ORDER BY day, created_at, id`;
  return rows.map(toPlanned);
}

/** The recipe it names doesn't exist (deleted meanwhile). */
export class UnknownRecipe extends Error {}

/** Plan a recipe or a note for a day, or change one (the same id): another day, slot or servings. */
export async function savePlanned(sql: Sql, input: Planned): Promise<Planned> {
  const p = Planned.parse(input);
  const recipeId = p.recipeId ?? null;
  const rows = await sql<Row>`
    INSERT INTO planned_recipes (id, day, recipe_id, note, meal, servings, created_at)
    SELECT ${p.id}, ${p.day}::date, ${recipeId}::text, ${p.note ?? null}::text, ${p.meal ?? null}::text,
           ${p.servings ?? null}::numeric, ${p.createdAt}::timestamptz
    WHERE ${recipeId}::text IS NULL OR EXISTS (SELECT 1 FROM recipes r WHERE r.id = ${recipeId}::text)
    ON CONFLICT (id) DO UPDATE SET
      day = EXCLUDED.day, recipe_id = EXCLUDED.recipe_id, note = EXCLUDED.note, meal = EXCLUDED.meal, servings = EXCLUDED.servings
    RETURNING id, to_char(day, 'YYYY-MM-DD') AS day, recipe_id, note, meal, servings, created_at`;
  if (!rows.length) throw new UnknownRecipe('That recipe was deleted.');
  return toPlanned(rows[0]);
}

export async function deletePlanned(sql: Sql, id: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`DELETE FROM planned_recipes WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
