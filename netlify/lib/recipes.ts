// Reading and writing recipes and settings in Netlify Database. The functions in netlify/functions call these; the tests
// (recipes.test.ts) run them against a local database.

import type { getDatabase } from '@netlify/database';
import { Recipe, Settings } from '../../src/lib/recipe';

type Sql = ReturnType<typeof getDatabase>['sql'];

type Row = {
  id: string;
  title: string;
  source: string;
  source_url: string | null;
  servings: string | number;
  serving_size: string;
  prep_minutes: number;
  cook_minutes: number;
  total_minutes: number;
  photos: Recipe['photos'];
  tags: string[];
  ingredients: Recipe['ingredients'];
  steps: Recipe['steps'];
  notes: string;
  rating: number;
  times_made: number;
  prepear_ids: string[] | null;
  last_made_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

export const fromRow = (r: Row): Recipe => ({
  id: r.id,
  title: r.title,
  source: r.source,
  ...(r.source_url ? { sourceUrl: r.source_url } : {}),
  servings: Number(r.servings),
  servingSize: r.serving_size,
  prepMinutes: r.prep_minutes,
  cookMinutes: r.cook_minutes,
  minutes: r.total_minutes,
  photos: r.photos,
  tags: r.tags,
  ingredients: r.ingredients,
  steps: r.steps,
  notes: r.notes,
  rating: r.rating,
  timesMade: r.times_made,
  ...(r.prepear_ids?.length ? { prepearIds: r.prepear_ids } : {}),
  lastMadeAt: r.last_made_at ? iso(r.last_made_at) : null,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export async function listRecipes(sql: Sql): Promise<Recipe[]> {
  const rows = await sql<Row>`SELECT * FROM recipes ORDER BY created_at DESC`;
  return rows.map(fromRow);
}

export async function getRecipe(sql: Sql, id: string): Promise<Recipe | null> {
  const [row] = await sql<Row>`SELECT * FROM recipes WHERE id = ${id}`;
  return row ? fromRow(row) : null;
}

// Photos picked on the phone arrive as data URLs and are uploaded (POST /api/photos) before the recipe is saved; the
// database only holds their addresses.
const SavedRecipe = Recipe.refine((r) => r.photos.every((p) => !p.src.startsWith('data:') && !p.original?.startsWith('data:')), {
  message: 'upload photos before saving the recipe',
  path: ['photos'],
});

/** Insert or replace a recipe. Returns the saved recipe and the one it replaced (to clean up photos it no longer uses). */
export async function saveRecipe(sql: Sql, input: Recipe): Promise<{ saved: Recipe; previous: Recipe | null }> {
  const r = SavedRecipe.parse(input);
  const previous = await getRecipe(sql, r.id);
  const tags = [...new Set(r.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  const [row] = await sql<Row>`
    INSERT INTO recipes (
      id, title, source, source_url, servings, serving_size, prep_minutes, cook_minutes, total_minutes,
      photos, tags, ingredients, steps, notes, rating, times_made, prepear_ids, last_made_at, created_at, updated_at
    ) VALUES (
      ${r.id}, ${r.title}, ${r.source}, ${r.sourceUrl ?? null}, ${r.servings}, ${r.servingSize}, ${r.prepMinutes},
      ${r.cookMinutes}, ${r.minutes}, ${JSON.stringify(r.photos)}::jsonb, ${tags}::text[], ${JSON.stringify(r.ingredients)}::jsonb,
      ${JSON.stringify(r.steps)}::jsonb, ${r.notes}, ${r.rating}, ${r.timesMade}, ${r.prepearIds ?? []}::text[], ${r.lastMadeAt ?? null}, ${r.createdAt}, now()
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title, source = EXCLUDED.source, source_url = EXCLUDED.source_url, servings = EXCLUDED.servings,
      serving_size = EXCLUDED.serving_size, prep_minutes = EXCLUDED.prep_minutes, cook_minutes = EXCLUDED.cook_minutes,
      total_minutes = EXCLUDED.total_minutes, photos = EXCLUDED.photos, tags = EXCLUDED.tags,
      ingredients = EXCLUDED.ingredients, steps = EXCLUDED.steps, notes = EXCLUDED.notes, rating = EXCLUDED.rating,
      times_made = EXCLUDED.times_made, prepear_ids = EXCLUDED.prepear_ids, last_made_at = EXCLUDED.last_made_at, updated_at = now()
    RETURNING *`;
  return { saved: fromRow(row), previous };
}

export async function deleteRecipe(sql: Sql, id: string): Promise<Recipe | null> {
  const [row] = await sql<Row>`DELETE FROM recipes WHERE id = ${id} RETURNING *`;
  return row ? fromRow(row) : null;
}

export async function getSettings(sql: Sql): Promise<Settings> {
  const rows = await sql<{ key: string; value: unknown }>`SELECT key, value FROM settings`;
  return Settings.parse(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

/** Save some settings; the others stay as they are. */
export async function saveSettings(sql: Sql, patch: Partial<Settings>): Promise<Settings> {
  const valid = Settings.partial().strict().parse(patch);
  // only the keys that were sent: Zod fills in defaults for the missing ones, which would reset them
  for (const key of Object.keys(patch) as (keyof Settings)[]) {
    const value = valid[key];
    await sql`
      INSERT INTO settings (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  }
  return getSettings(sql);
}

const PHOTO_PREFIX = '/api/photos/';

/** Keys of the stored photos a recipe uses (its shown crops and the originals kept for re-cropping). */
export const photoKeys = (r: Recipe | null): string[] =>
  (r?.photos ?? [])
    .flatMap((p) => [p.src, p.original])
    .filter((u): u is string => !!u && u.startsWith(PHOTO_PREFIX))
    .map((u) => u.slice(PHOTO_PREFIX.length));

export const photoUrl = (key: string) => `${PHOTO_PREFIX}${key}`;
