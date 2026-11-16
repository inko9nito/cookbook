import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { NetlifyDB } from '@netlify/database-dev';
import { getDatabase } from '@netlify/database';
import { deleteCookbook, DuplicatePrepearCookbook, getCookbook, listCookbooks, saveCookbook } from './cookbooks';
import { deleteRecipe, saveRecipe } from './recipes';
import { emptyRecipe } from '../../src/lib/recipe';
import type { Cookbook } from '../../src/lib/cookbook';

// Runs the real migrations on a local Postgres, then the same queries the API function uses.
let local: NetlifyDB;
let db: ReturnType<typeof getDatabase>;

beforeAll(async () => {
  local = new NetlifyDB();
  const connectionString = await local.start();
  await local.applyMigrations('./netlify/database/migrations');
  db = getDatabase({ connectionString });
  for (const id of ['r1', 'r2', 'r3', 'r4']) await saveRecipe(db.sql, { ...emptyRecipe(), id, title: `Recipe ${id}`, createdAt: '2026-11-16T10:00:00.000Z' });
}, 60_000);

afterAll(async () => {
  await db?.pool.end();
  await local?.stop();
});

const book = (over: Partial<Cookbook> = {}): Cookbook => ({
  id: 'b1',
  name: 'Everything else',
  coverRecipeId: 'r2',
  recipeIds: ['r3', 'r1'],
  sections: [
    { id: 's1', name: 'Meat', coverRecipeId: null, recipeIds: ['r2', 'r1'] },
    { id: 's2', name: 'Seafood', coverRecipeId: 'r4', recipeIds: ['r4'] },
  ],
  createdAt: '2026-11-16T10:00:00.000Z',
  ...over,
});

describe('cookbooks in the database', () => {
  test('a cookbook is saved and read back with its sections and recipes in order', async () => {
    const saved = await saveCookbook(db, book());
    expect(saved).toMatchObject({ ...book(), updatedAt: expect.any(String) });
    expect(await listCookbooks(db)).toEqual([saved]);
  });

  test('saving again replaces sections and recipes; a recipe can be in several places', async () => {
    const saved = await saveCookbook(
      db,
      book({ name: 'Mains', recipeIds: ['r1'], sections: [{ id: 's2', name: 'Fish', recipeIds: ['r4', 'r1', 'r1'] }, { id: 's3', name: 'Other', recipeIds: ['r1'] }] }),
    );
    expect(saved.name).toBe('Mains');
    expect(saved.recipeIds).toEqual(['r1']);
    expect(saved.sections).toEqual([
      { id: 's2', name: 'Fish', coverRecipeId: null, recipeIds: ['r4', 'r1'] },
      { id: 's3', name: 'Other', coverRecipeId: null, recipeIds: ['r1'] },
    ]);
  });

  test('recipe ids that name no recipe are left out', async () => {
    const saved = await saveCookbook(db, book({ id: 'b2', name: 'Bread', coverRecipeId: 'gone', recipeIds: ['gone', 'r2'], sections: [] }));
    expect(saved.recipeIds).toEqual(['r2']);
    expect(saved.coverRecipeId).toBeNull();
  });

  test('cookbooks are listed A–Z', async () => {
    expect((await listCookbooks(db)).map((c) => c.name)).toEqual(['Bread', 'Mains']);
  });

  test('deleting a recipe takes it out of every cookbook and clears it as a cover', async () => {
    await saveCookbook(db, book({ id: 'b3', name: 'Covers', coverRecipeId: 'r3', recipeIds: ['r3', 'r2'], sections: [{ id: 's9', name: 'X', coverRecipeId: 'r3', recipeIds: ['r3'] }] }));
    await deleteRecipe(db.sql, 'r3');
    const c = await getCookbook(db, 'b3');
    expect(c).toMatchObject({ coverRecipeId: null, recipeIds: ['r2'], sections: [{ id: 's9', coverRecipeId: null, recipeIds: [] }] });
  });

  test('a collage cover keeps up to three recipes in order, leaving out ones that don’t exist', async () => {
    const saved = await saveCookbook(db, book({ id: 'cv', name: 'Covers 2', coverRecipeId: null, coverRecipeIds: ['r4', 'gone', 'r2'], sections: [] }));
    expect(saved.coverRecipeIds).toEqual(['r4', 'r2']);
    expect(saved.coverRecipeId).toBe('r4');
    // an older copy of the app sends just the one cover
    const older = await saveCookbook(db, book({ id: 'cv', name: 'Covers 2', coverRecipeId: 'r2', sections: [] }));
    expect(older.coverRecipeIds).toEqual(['r2']);
    await deleteCookbook(db, 'cv');
  });

  test('a chosen colour is kept; none until one is chosen', async () => {
    expect((await saveCookbook(db, book({ id: 'co', name: 'Colour', sections: [] }))).color).toBeUndefined();
    expect((await saveCookbook(db, book({ id: 'co', name: 'Colour', color: 'sage', sections: [] }))).color).toBe('sage');
    await deleteCookbook(db, 'co');
  });

  test('a Prepear cookbook is kept once', async () => {
    await saveCookbook(db, book({ id: 'p1', name: 'From Prepear', prepearId: 'prep-1', sections: [] }));
    await expect(saveCookbook(db, book({ id: 'p2', name: 'Again', prepearId: 'prep-1', sections: [] }))).rejects.toBeInstanceOf(DuplicatePrepearCookbook);
    // saving it later without the id (the app doesn't change it) keeps it
    expect((await saveCookbook(db, book({ id: 'p1', name: 'Renamed', sections: [] }))).prepearId).toBe('prep-1');
  });

  test('deleting a cookbook deletes its sections and entries, not the recipes', async () => {
    expect(await deleteCookbook(db, 'b1')).toBe(true);
    expect(await getCookbook(db, 'b1')).toBeNull();
    const left = await db.sql<{ n: number }>`SELECT count(*)::int AS n FROM cookbook_sections WHERE cookbook_id = 'b1'`;
    expect(left[0].n).toBe(0);
    const recipes = await db.sql<{ n: number }>`SELECT count(*)::int AS n FROM recipes`;
    expect(recipes[0].n).toBe(3);
  });
});
