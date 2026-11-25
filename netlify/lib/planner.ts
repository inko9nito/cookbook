// Reading and writing the Planner (issues #62, #67) in Netlify Database. netlify/functions/planner.mts calls these; the
// tests (planner.test.ts) run them against a local database.

import type { getDatabase } from '@netlify/database';
import { Planned } from '../../src/lib/planner';
import { NotYours } from './recipes';

type Sql = ReturnType<typeof getDatabase>['sql'];

// the day comes back as text, so no time zone can move it to the day before
type Row = {
  id: string;
  day: string;
  recipe_id: string | null;
  note: string | null;
  meal: Planned['meal'] | null;
  servings: string | number | null;
  position: number | null;
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
  ...(r.position != null ? { position: r.position } : {}),
  createdAt: iso(r.created_at),
});

// Every function takes the owner whose Planner it is (issue #146): '' is the admin's.

/** Everything the owner planned, by day, then in order (#164: the places dragged to, then the rest as added). */
export async function listPlanned(sql: Sql, owner: string): Promise<Planned[]> {
  const rows = await sql<Row>`
    SELECT id, to_char(day, 'YYYY-MM-DD') AS day, recipe_id, note, meal, servings, position, created_at
    FROM planned_recipes WHERE owner_id = ${owner} ORDER BY day, position NULLS LAST, created_at, id`;
  return rows.map(toPlanned);
}

/** The recipe it names doesn't exist (deleted meanwhile). */
export class UnknownRecipe extends Error {}

/** Plan a recipe or a note for a day, or change one (the same id): another day, slot, servings or place. */
export async function savePlanned(sql: Sql, owner: string, input: Planned): Promise<Planned> {
  const p = Planned.parse(input);
  const recipeId = p.recipeId ?? null;
  // only the owner's own recipes can be planned, and another owner's plan with this id is left alone
  const rows = await sql<Row>`
    INSERT INTO planned_recipes (owner_id, id, day, recipe_id, note, meal, servings, position, created_at)
    SELECT ${owner}, ${p.id}, ${p.day}::date, ${recipeId}::text, ${p.note ?? null}::text, ${p.meal ?? null}::text,
           ${p.servings ?? null}::numeric, ${p.position ?? null}::integer, ${p.createdAt}::timestamptz
    WHERE ${recipeId}::text IS NULL OR EXISTS (SELECT 1 FROM recipes r WHERE r.id = ${recipeId}::text AND r.owner_id = ${owner})
    ON CONFLICT (id) DO UPDATE SET
      day = EXCLUDED.day, recipe_id = EXCLUDED.recipe_id, note = EXCLUDED.note, meal = EXCLUDED.meal, servings = EXCLUDED.servings,
      position = EXCLUDED.position
    WHERE planned_recipes.owner_id = EXCLUDED.owner_id
    RETURNING id, to_char(day, 'YYYY-MM-DD') AS day, recipe_id, note, meal, servings, position, created_at`;
  if (rows.length) return toPlanned(rows[0]);
  const [mine] = await sql<{ id: string }>`SELECT id FROM recipes WHERE id = ${recipeId}::text AND owner_id = ${owner}`;
  throw recipeId && !mine ? new UnknownRecipe('That recipe was deleted.') : new NotYours('That isn’t in your Planner.');
}

export async function deletePlanned(sql: Sql, owner: string, id: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`DELETE FROM planned_recipes WHERE id = ${id} AND owner_id = ${owner} RETURNING id`;
  return rows.length > 0;
}
