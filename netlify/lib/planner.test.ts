import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { NetlifyDB } from '@netlify/database-dev';
import { getDatabase } from '@netlify/database';
import { deletePlanned, listPlanned, savePlanned, UnknownRecipe } from './planner';
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

describe('the planner in the database', () => {
  test('planned recipes come back by day, then in the order added, with the day unchanged', async () => {
    await savePlanned(db.sql, { id: 'p1', day: '2026-11-18', recipeId: 'r1', createdAt: '2026-11-17T10:00:02.000Z' });
    await savePlanned(db.sql, { id: 'p2', day: '2026-11-18', recipeId: 'r2', createdAt: '2026-11-17T10:00:01.000Z' });
    await savePlanned(db.sql, { id: 'p3', day: '2026-11-17', recipeId: 'r1', createdAt: '2026-11-17T11:00:00.000Z' });
    expect(await listPlanned(db.sql)).toEqual([
      { id: 'p3', day: '2026-11-17', recipeId: 'r1', createdAt: '2026-11-17T11:00:00.000Z' },
      { id: 'p2', day: '2026-11-18', recipeId: 'r2', createdAt: '2026-11-17T10:00:01.000Z' },
      { id: 'p1', day: '2026-11-18', recipeId: 'r1', createdAt: '2026-11-17T10:00:02.000Z' },
    ]);
  });

  test('saving the same id again moves it to another day', async () => {
    const moved = await savePlanned(db.sql, { id: 'p3', day: '2026-11-21', recipeId: 'r1', createdAt: '2026-11-17T11:00:00.000Z' });
    expect(moved.day).toBe('2026-11-21');
    expect((await listPlanned(db.sql)).map((p) => `${p.id}:${p.day}`)).toEqual(['p2:2026-11-18', 'p1:2026-11-18', 'p3:2026-11-21']);
  });

  test('a recipe that doesn’t exist is refused', async () => {
    await expect(savePlanned(db.sql, { id: 'p9', day: '2026-11-18', recipeId: 'gone', createdAt: '2026-11-17T10:00:00.000Z' })).rejects.toBeInstanceOf(UnknownRecipe);
  });

  test('a bad day is refused', async () => {
    await expect(savePlanned(db.sql, { id: 'p9', day: 'tomorrow', recipeId: 'r1', createdAt: '2026-11-17T10:00:00.000Z' })).rejects.toThrow();
  });

  test('taking one off its day, and deleting a recipe takes it off every day', async () => {
    expect(await deletePlanned(db.sql, 'p2')).toBe(true);
    expect(await deletePlanned(db.sql, 'p2')).toBe(false);
    await deleteRecipe(db.sql, 'r1');
    expect(await listPlanned(db.sql)).toEqual([]);
  });
});
