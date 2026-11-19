// Reading and changing the grocery list (issue #64) in Netlify Database. netlify/functions/groceries.mts calls these;
// the tests (groceries.test.ts) run them against a local database.
//
// The app sends each change as a batch (the items to save and the ones to take off), applied in one transaction:
// adding a recipe adds all its ingredients at once, and Clear takes every ticked item off at once. An item whose recipe
// was deleted meanwhile is left out rather than refused.

import type { getDatabase } from '@netlify/database';
import { GroceryChange, type GroceryItem } from '../../src/lib/groceries';

// the pool is used for one transaction; only the part of it used here (the server and serverless pools differ in type)
type Client = { query: (text: string, values?: unknown[]) => Promise<unknown>; release: () => void };
type Db = Pick<ReturnType<typeof getDatabase>, 'sql'> & { pool: { connect: () => Promise<Client> } };

type Row = {
  id: string;
  recipe_id: string | null;
  ingredient_id: string | null;
  servings: string | number | null;
  planned_id: string | null;
  text: string | null;
  store: string | null;
  choice: string | null;
  checked: boolean;
  created_at: Date | string;
};

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());
const toItem = (r: Row): GroceryItem => ({
  id: r.id,
  ...(r.recipe_id ? { recipeId: r.recipe_id } : {}),
  ...(r.ingredient_id ? { ingredientId: r.ingredient_id } : {}),
  ...(r.servings != null ? { servings: Number(r.servings) } : {}),
  ...(r.planned_id ? { plannedId: r.planned_id } : {}),
  ...(r.text ? { text: r.text } : {}),
  ...(r.store ? { store: r.store } : {}),
  ...(r.choice ? { choice: r.choice } : {}),
  checked: r.checked,
  createdAt: iso(r.created_at),
});

/** Everything on the list, in the order added. */
export async function listGroceries({ sql }: Pick<Db, 'sql'>): Promise<GroceryItem[]> {
  const rows = await sql<Row>`
    SELECT id, recipe_id, ingredient_id, servings, planned_id, text, store, choice, checked, created_at
    FROM grocery_items ORDER BY created_at, id`;
  return rows.map(toItem);
}

/** Save some items (new or changed: ticked, pinned to a store) and take some off, in one transaction. */
export async function changeGroceries(db: Db, input: unknown): Promise<void> {
  const { save, remove } = GroceryChange.parse(input);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    if (remove.length) await client.query('DELETE FROM grocery_items WHERE id = ANY($1::text[])', [remove]);
    if (save.length) {
      const col = <T>(f: (g: GroceryItem) => T) => save.map(f);
      await client.query(
        `INSERT INTO grocery_items (id, recipe_id, ingredient_id, servings, planned_id, text, store, checked, created_at, choice)
         SELECT t.id, t.recipe_id, t.ingredient_id, t.servings, t.planned_id, t.text, t.store, t.checked, t.created_at, t.choice
         FROM unnest($1::text[], $2::text[], $3::text[], $4::numeric[], $5::text[], $6::text[], $7::text[], $8::boolean[], $9::timestamptz[], $10::text[])
           AS t(id, recipe_id, ingredient_id, servings, planned_id, text, store, checked, created_at, choice)
         WHERE t.recipe_id IS NULL OR EXISTS (SELECT 1 FROM recipes r WHERE r.id = t.recipe_id)
         ON CONFLICT (id) DO UPDATE SET
           recipe_id = EXCLUDED.recipe_id, ingredient_id = EXCLUDED.ingredient_id, servings = EXCLUDED.servings,
           planned_id = EXCLUDED.planned_id, text = EXCLUDED.text, store = EXCLUDED.store, checked = EXCLUDED.checked,
           choice = EXCLUDED.choice`,
        [
          col((g) => g.id),
          col((g) => g.recipeId ?? null),
          col((g) => g.ingredientId ?? null),
          col((g) => g.servings ?? null),
          col((g) => g.plannedId ?? null),
          col((g) => g.text ?? null),
          col((g) => g.store ?? null),
          col((g) => g.checked),
          col((g) => g.createdAt),
          col((g) => g.choice ?? null),
        ],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
