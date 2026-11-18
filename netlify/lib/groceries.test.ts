import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { NetlifyDB } from '@netlify/database-dev';
import { getDatabase } from '@netlify/database';
import { changeGroceries, listGroceries } from './groceries';
import { deleteRecipe, saveRecipe } from './recipes';
import { emptyRecipe } from '../../src/lib/recipe';

// Runs the real migrations on a local Postgres, then the same queries the API function uses.
let local: NetlifyDB;
let db: ReturnType<typeof getDatabase>;

beforeAll(async () => {
  local = new NetlifyDB();
  const connectionString = await local.start();
  await local.applyMigrations('./netlify/database/migrations');
  db = getDatabase({ connectionString });
  for (const id of ['r1', 'r2']) await saveRecipe(db.sql, { ...emptyRecipe(), id, title: `Recipe ${id}`, createdAt: '2026-11-16T10:00:00.000Z' });
}, 60_000);

afterAll(async () => {
  await db?.pool.end();
  await local?.stop();
});

const at = (s: number) => `2026-11-18T10:00:${String(s).padStart(2, '0')}.000Z`;

describe('the grocery list in the database', () => {
  test('items come back in the order added, as saved', async () => {
    await changeGroceries(db, {
      save: [
        { id: 'g2', recipeId: 'r1', ingredientId: 'i2', servings: 8, plannedId: 'p1', checked: false, createdAt: at(2) },
        { id: 'g1', text: 'paper towels', checked: false, createdAt: at(1) },
        { id: 'g3', recipeId: 'r2', ingredientId: 'i1', checked: false, createdAt: at(3) },
      ],
    });
    expect(await listGroceries(db)).toEqual([
      { id: 'g1', text: 'paper towels', checked: false, createdAt: at(1) },
      { id: 'g2', recipeId: 'r1', ingredientId: 'i2', servings: 8, plannedId: 'p1', checked: false, createdAt: at(2) },
      { id: 'g3', recipeId: 'r2', ingredientId: 'i1', checked: false, createdAt: at(3) },
    ]);
  });

  test('ticking, pinning to a store and taking off, in one change', async () => {
    await changeGroceries(db, {
      save: [{ id: 'g1', text: 'paper towels', checked: true, store: 'acme-market', createdAt: at(1) }],
      remove: ['g3'],
    });
    const list = await listGroceries(db);
    expect(list.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(list[0]).toMatchObject({ checked: true, store: 'acme-market' });
  });

  test('an item whose recipe is gone is left out; deleting a recipe takes its items off', async () => {
    await changeGroceries(db, { save: [{ id: 'g4', recipeId: 'nope', ingredientId: 'i1', checked: false, createdAt: at(4) }] });
    expect((await listGroceries(db)).map((g) => g.id)).toEqual(['g1', 'g2']);
    await deleteRecipe(db.sql, 'r1');
    expect((await listGroceries(db)).map((g) => g.id)).toEqual(['g1']);
  });

  test('an item must be an ingredient or typed text, and a failed change changes nothing', async () => {
    await expect(changeGroceries(db, { save: [{ id: 'g5', checked: false, createdAt: at(5) }] })).rejects.toThrow();
    await expect(changeGroceries(db, { save: [{ id: 'g6', text: 'x', recipeId: 'r2', ingredientId: 'i1', checked: false, createdAt: at(6) }] })).rejects.toThrow();
    expect((await listGroceries(db)).map((g) => g.id)).toEqual(['g1']);
  });
});
