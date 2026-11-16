// Reading and writing cookbooks (issue #25) in Netlify Database. netlify/functions/cookbooks.mts calls these; the tests
// (cookbooks.test.ts) run them against a local database.
//
// The app sends a whole cookbook at once (its sections and recipe ids in order), and saving replaces what's stored in
// one transaction. Recipe ids that name no recipe (deleted meanwhile) are left out rather than refused.

import type { getDatabase } from '@netlify/database';
import { Cookbook } from '../../src/lib/cookbook';

// the pool is used for one transaction; only the part of it used here (the server and serverless pools differ in type)
type Client = { query: (text: string, values?: unknown[]) => Promise<unknown>; release: () => void };
type Db = Pick<ReturnType<typeof getDatabase>, 'sql'> & { pool: { connect: () => Promise<Client> } };

type BookRow = { id: string; name: string; cover_recipe_id: string | null; cover_recipe_ids: string[] | null; prepear_id: string | null; created_at: Date | string; updated_at: Date | string };
type SectionRow = { id: string; cookbook_id: string; name: string; cover_recipe_id: string | null };
type EntryRow = { cookbook_id: string; section_id: string | null; recipe_id: string };

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

function assemble(books: BookRow[], sections: SectionRow[], entries: EntryRow[]): Cookbook[] {
  // entries come in position order, so pushing keeps it
  const placeKey = (cookbookId: string, sectionId: string | null) => `${cookbookId}\u0000${sectionId ?? ''}`;
  const places = new Map<string, string[]>();
  for (const e of entries) {
    const k = placeKey(e.cookbook_id, e.section_id);
    if (!places.has(k)) places.set(k, []);
    places.get(k)!.push(e.recipe_id);
  }
  return books.map((b) => ({
    id: b.id,
    name: b.name,
    coverRecipeId: b.cover_recipe_id,
    coverRecipeIds: b.cover_recipe_ids ?? [],
    recipeIds: places.get(placeKey(b.id, null)) ?? [],
    sections: sections
      .filter((s) => s.cookbook_id === b.id)
      .map((s) => ({ id: s.id, name: s.name, coverRecipeId: s.cover_recipe_id, recipeIds: places.get(placeKey(b.id, s.id)) ?? [] })),
    ...(b.prepear_id ? { prepearId: b.prepear_id } : {}),
    createdAt: iso(b.created_at),
    updatedAt: iso(b.updated_at),
  }));
}

/** Every cookbook, A–Z. */
export async function listCookbooks({ sql }: Db): Promise<Cookbook[]> {
  const books = await sql<BookRow>`SELECT * FROM cookbooks ORDER BY lower(name), created_at`;
  const sections = await sql<SectionRow>`SELECT id, cookbook_id, name, cover_recipe_id FROM cookbook_sections ORDER BY cookbook_id, position`;
  const entries = await sql<EntryRow>`SELECT cookbook_id, section_id, recipe_id FROM cookbook_recipes ORDER BY cookbook_id, section_id NULLS FIRST, position`;
  return assemble(books, sections, entries);
}

export async function getCookbook({ sql }: Db, id: string): Promise<Cookbook | null> {
  const books = await sql<BookRow>`SELECT * FROM cookbooks WHERE id = ${id}`;
  if (!books.length) return null;
  const sections = await sql<SectionRow>`SELECT id, cookbook_id, name, cover_recipe_id FROM cookbook_sections WHERE cookbook_id = ${id} ORDER BY position`;
  const entries = await sql<EntryRow>`SELECT cookbook_id, section_id, recipe_id FROM cookbook_recipes WHERE cookbook_id = ${id} ORDER BY section_id NULLS FIRST, position`;
  return assemble(books, sections, entries)[0];
}

/** A Prepear id that another cookbook already has. */
export class DuplicatePrepearCookbook extends Error {}

/** Insert or replace a cookbook with its sections and recipes. */
export async function saveCookbook(db: Db, input: Cookbook): Promise<Cookbook> {
  const c = Cookbook.parse(input);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    // the collage's cover recipes, in order, leaving out any that no longer exist; the first is also the single cover
    const covers = c.coverRecipeIds?.length ? c.coverRecipeIds : c.coverRecipeId ? [c.coverRecipeId] : [];
    await client.query(
      `WITH covers AS (
         SELECT coalesce(array_agg(t.id ORDER BY t.n), '{}') AS ids
         FROM unnest($3::text[]) WITH ORDINALITY AS t(id, n) JOIN recipes r ON r.id = t.id
       )
       INSERT INTO cookbooks (id, name, cover_recipe_id, cover_recipe_ids, prepear_id, created_at, updated_at)
       SELECT $1, $2, covers.ids[1], covers.ids, $4, $5, now() FROM covers
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, cover_recipe_id = EXCLUDED.cover_recipe_id, cover_recipe_ids = EXCLUDED.cover_recipe_ids,
         prepear_id = COALESCE(EXCLUDED.prepear_id, cookbooks.prepear_id), updated_at = now()`,
      [c.id, c.name, [...new Set(covers)].slice(0, 3), c.prepearId ?? null, c.createdAt],
    );
    await client.query('DELETE FROM cookbook_recipes WHERE cookbook_id = $1', [c.id]);
    await client.query('DELETE FROM cookbook_sections WHERE cookbook_id = $1', [c.id]);
    if (c.sections.length) {
      await client.query(
        `INSERT INTO cookbook_sections (id, cookbook_id, name, cover_recipe_id, position)
         SELECT t.id, $1, t.name, (SELECT r.id FROM recipes r WHERE r.id = t.cover), t.position
         FROM unnest($2::text[], $3::text[], $4::text[], $5::int[]) AS t(id, name, cover, position)`,
        [c.id, c.sections.map((s) => s.id), c.sections.map((s) => s.name), c.sections.map((s) => s.coverRecipeId ?? null), c.sections.map((_, i) => i)],
      );
    }
    const places: [string | null, string[]][] = [[null, c.recipeIds], ...c.sections.map((s) => [s.id, s.recipeIds] as [string, string[]])];
    const rows = places.flatMap(([sectionId, ids]) => [...new Set(ids)].map((recipeId, position) => ({ sectionId, recipeId, position })));
    if (rows.length) {
      // only recipes that exist (one deleted meanwhile is left out)
      await client.query(
        `INSERT INTO cookbook_recipes (cookbook_id, section_id, recipe_id, position)
         SELECT $1, t.section_id, t.recipe_id, t.position
         FROM unnest($2::text[], $3::text[], $4::int[]) AS t(section_id, recipe_id, position)
         JOIN recipes r ON r.id = t.recipe_id`,
        [c.id, rows.map((r) => r.sectionId), rows.map((r) => r.recipeId), rows.map((r) => r.position)],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    if ((e as { code?: string })?.code === '23505' && String((e as { constraint?: string }).constraint).includes('prepear_id')) {
      throw new DuplicatePrepearCookbook('That Prepear cookbook is already here.');
    }
    throw e;
  } finally {
    client.release();
  }
  return (await getCookbook(db, c.id))!;
}

export async function deleteCookbook({ sql }: Db, id: string): Promise<boolean> {
  const rows = await sql<{ id: string }>`DELETE FROM cookbooks WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
