import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { NetlifyDB } from '@netlify/database-dev';
import { getDatabase } from '@netlify/database';
import { deletePlanned, listPlanned, savePlanned, UnknownRecipe } from './planner';
import { deleteRecipe, saveRecipe } from './recipes';
import { emptyRecipe } from '../../src/lib/recipe';

// the admin's cookbook, the original one (issue #146)
const A = '';

// Runs the real migrations on a local Postgres, then the same queries the API function uses.
let local: NetlifyDB;
let db: ReturnType<typeof getDatabase>;

beforeAll(async () => {
  local = new NetlifyDB();
  const connectionString = await local.start();
  await local.applyMigrations('./netlify/database/migrations');
  db = getDatabase({ connectionString });
  for (const id of ['r1', 'r2']) await saveRecipe(db.sql, A, { ...emptyRecipe(), id, title: `Recipe ${id}`, createdAt: '2026-11-16T10:00:00.000Z' });
}, 60_000);

afterAll(async () => {
  await db?.pool.end();
  await local?.stop();
});

describe('the planner in the database', () => {
  test('planned recipes come back by day, then in the order added, with the day unchanged', async () => {
    await savePlanned(db.sql, A, { id: 'p1', day: '2026-11-18', recipeId: 'r1', createdAt: '2026-11-17T10:00:02.000Z' });
    await savePlanned(db.sql, A, { id: 'p2', day: '2026-11-18', recipeId: 'r2', createdAt: '2026-11-17T10:00:01.000Z' });
    await savePlanned(db.sql, A, { id: 'p3', day: '2026-11-17', recipeId: 'r1', createdAt: '2026-11-17T11:00:00.000Z' });
    expect(await listPlanned(db.sql, A)).toEqual([
      { id: 'p3', day: '2026-11-17', recipeId: 'r1', createdAt: '2026-11-17T11:00:00.000Z' },
      { id: 'p2', day: '2026-11-18', recipeId: 'r2', createdAt: '2026-11-17T10:00:01.000Z' },
      { id: 'p1', day: '2026-11-18', recipeId: 'r1', createdAt: '2026-11-17T10:00:02.000Z' },
    ]);
  });

  test('saving the same id again moves it to another day', async () => {
    const moved = await savePlanned(db.sql, A, { id: 'p3', day: '2026-11-21', recipeId: 'r1', createdAt: '2026-11-17T11:00:00.000Z' });
    expect(moved.day).toBe('2026-11-21');
    expect((await listPlanned(db.sql, A)).map((p) => `${p.id}:${p.day}`)).toEqual(['p2:2026-11-18', 'p1:2026-11-18', 'p3:2026-11-21']);
  });

  test('a recipe that doesn’t exist is refused', async () => {
    await expect(savePlanned(db.sql, A, { id: 'p9', day: '2026-11-18', recipeId: 'gone', createdAt: '2026-11-17T10:00:00.000Z' })).rejects.toBeInstanceOf(UnknownRecipe);
  });

  test('a bad day is refused', async () => {
    await expect(savePlanned(db.sql, A, { id: 'p9', day: 'tomorrow', recipeId: 'r1', createdAt: '2026-11-17T10:00:00.000Z' })).rejects.toThrow();
  });

  test('a slot, the servings, and a note instead of a recipe (#67)', async () => {
    const dinner = await savePlanned(db.sql, A, { id: 'p4', day: '2026-11-19', recipeId: 'r2', meal: 'dinner', servings: 1.5, createdAt: '2026-11-17T12:00:00.000Z' });
    expect(dinner).toEqual({ id: 'p4', day: '2026-11-19', recipeId: 'r2', meal: 'dinner', servings: 1.5, createdAt: '2026-11-17T12:00:00.000Z' });
    const note = await savePlanned(db.sql, A, { id: 'p5', day: '2026-11-19', note: 'Eating out', meal: 'lunch', createdAt: '2026-11-17T12:00:01.000Z' });
    expect(note).toEqual({ id: 'p5', day: '2026-11-19', note: 'Eating out', meal: 'lunch', createdAt: '2026-11-17T12:00:01.000Z' });
    // out of its slot again, back to the recipe's own servings
    const { meal: _m, servings: _s, ...plain } = dinner;
    expect(await savePlanned(db.sql, A, plain)).toEqual(plain);
    await expect(savePlanned(db.sql, A, { id: 'p6', day: '2026-11-19', createdAt: '2026-11-17T12:00:00.000Z' })).rejects.toThrow();
    await deletePlanned(db.sql, A, 'p4');
    await deletePlanned(db.sql, A, 'p5');
  });

  test('a place in its slot comes first, then the rest as added (#164)', async () => {
    await savePlanned(db.sql, A, { id: 'q1', day: '2026-11-25', recipeId: 'r1', createdAt: '2026-11-24T10:00:00.000Z' });
    await savePlanned(db.sql, A, { id: 'q2', day: '2026-11-25', recipeId: 'r2', createdAt: '2026-11-24T10:00:01.000Z' });
    await savePlanned(db.sql, A, { id: 'q3', day: '2026-11-25', note: 'Leftovers', createdAt: '2026-11-24T10:00:02.000Z' });
    const day = async () => (await listPlanned(db.sql, A)).filter((p) => p.day === '2026-11-25').map((p) => p.id);
    expect(await day()).toEqual(['q1', 'q2', 'q3']);
    const q2 = await savePlanned(db.sql, A, { id: 'q2', day: '2026-11-25', recipeId: 'r2', position: 0, createdAt: '2026-11-24T10:00:01.000Z' });
    expect(q2.position).toBe(0);
    await savePlanned(db.sql, A, { id: 'q1', day: '2026-11-25', recipeId: 'r1', position: 1, createdAt: '2026-11-24T10:00:00.000Z' });
    expect(await day()).toEqual(['q2', 'q1', 'q3']);
    // saved without a place again (moved to another slot), it goes after the placed ones
    await savePlanned(db.sql, A, { id: 'q2', day: '2026-11-25', recipeId: 'r2', createdAt: '2026-11-24T10:00:01.000Z' });
    expect(await day()).toEqual(['q1', 'q2', 'q3']);
    for (const id of ['q1', 'q2', 'q3']) await deletePlanned(db.sql, A, id);
  });

  test('taking one off its day, and deleting a recipe takes it off every day', async () => {
    expect(await deletePlanned(db.sql, A, 'p2')).toBe(true);
    expect(await deletePlanned(db.sql, A, 'p2')).toBe(false);
    await deleteRecipe(db.sql, A, 'r1');
    expect(await listPlanned(db.sql, A)).toEqual([]);
  });
});
