import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { NetlifyDB } from '@netlify/database-dev';
import { getDatabase } from '@netlify/database';
import { deleteRecipe, getSettings, listRecipes, photoKeys, saveRecipe, saveSettings } from './recipes';
import { emptyRecipe, type Recipe } from '../../src/lib/recipe';

// Runs the real migrations on a local Postgres, then the same queries the API functions use.
let local: NetlifyDB;
let db: ReturnType<typeof getDatabase>;

beforeAll(async () => {
  local = new NetlifyDB();
  const connectionString = await local.start();
  await local.applyMigrations('./netlify/database/migrations');
  db = getDatabase({ connectionString });
}, 60_000);

afterAll(async () => {
  await db?.pool.end();
  await local?.stop();
});

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  ...emptyRecipe(),
  title: 'Test soup',
  createdAt: '2026-11-15T10:00:00.000Z',
  tags: ['Soup', 'quick', 'soup'],
  ingredients: [
    { id: 'a', kind: 'header', amount: '', unit: '', name: 'For the soup', note: '' },
    { id: 'b', amount: '1-2', unit: 'tsp', name: 'salt', note: 'divided', raw: '1-2 tsp salt, divided' },
  ],
  steps: [{ id: 'c', text: 'Simmer 10 minutes.' }],
  photos: [{ id: 'p', src: '/api/photos/one.jpg', original: '/api/photos/one-full.jpg', crop: { x: 0, y: 0, width: 400, height: 300 } }],
  ...over,
});

describe('recipes in the database', () => {
  test('the sample recipes are seeded, then deleted once the Prepear import exists (#14)', async () => {
    expect(await listRecipes(db.sql)).toEqual([]);
  });

  test('a recipe keeps its Prepear ids, and one without them has none (#14)', async () => {
    const { saved } = await saveRecipe(db.sql, recipe({ id: 'from-prepear', prepearIds: ['p-adapted', 'p-original'] }));
    expect(saved.prepearIds).toEqual(['p-adapted', 'p-original']);
    const { saved: again } = await saveRecipe(db.sql, { ...saved, title: 'Edited here' });
    expect(again.prepearIds).toEqual(['p-adapted', 'p-original']);
    const { saved: plain } = await saveRecipe(db.sql, recipe({ id: 'typed-in' }));
    expect(plain.prepearIds).toBeUndefined();
  });

  test('saving keeps every field and tidies tags', async () => {
    const r = recipe();
    const { saved, previous } = await saveRecipe(db.sql, r);
    expect(previous).toBeNull();
    expect(saved).toMatchObject({ ...r, tags: ['soup', 'quick'], lastMadeAt: null });
    expect(saved.updatedAt).toBeTruthy();
  });

  test('saving again replaces the recipe and returns the old one', async () => {
    const r = recipe({ id: 'replace-me' });
    await saveRecipe(db.sql, r);
    const { saved, previous } = await saveRecipe(db.sql, { ...r, title: 'Better soup', timesMade: 2, photos: [] });
    expect(previous?.title).toBe('Test soup');
    expect(saved.title).toBe('Better soup');
    expect(saved.timesMade).toBe(2);
    expect(photoKeys(previous)).toEqual(['one.jpg', 'one-full.jpg']);
    expect(photoKeys(saved)).toEqual([]);
  });

  test('newest first', async () => {
    await saveRecipe(db.sql, recipe({ id: 'old', createdAt: '2020-01-01T00:00:00.000Z' }));
    await saveRecipe(db.sql, recipe({ id: 'new', createdAt: '2030-01-01T00:00:00.000Z' }));
    const ids = (await listRecipes(db.sql)).map((r) => r.id);
    expect(ids[0]).toBe('new');
    expect(ids.at(-1)).toBe('old');
  });

  test('invalid recipes and photos that were never uploaded are refused', async () => {
    await expect(saveRecipe(db.sql, { ...recipe(), rating: 9 })).rejects.toThrow();
    await expect(saveRecipe(db.sql, recipe({ photos: [{ id: 'x', src: 'data:image/jpeg;base64,AAAA' }] }))).rejects.toThrow(/upload photos/);
  });

  test('delete returns what was deleted', async () => {
    await saveRecipe(db.sql, recipe({ id: 'bye' }));
    expect((await deleteRecipe(db.sql, 'bye'))?.id).toBe('bye');
    expect(await deleteRecipe(db.sql, 'bye')).toBeNull();
  });
});

describe('settings', () => {
  test('defaults, then remembered (R1, R2)', async () => {
    expect(await getSettings(db.sql)).toEqual({ sort: 'newest', filterTags: [], filterMode: 'all', cookbookView: 'grid' });
    await saveSettings(db.sql, { sort: 'az' });
    expect(await saveSettings(db.sql, { filterTags: ['soup'], filterMode: 'any' })).toEqual({ sort: 'az', filterTags: ['soup'], filterMode: 'any', cookbookView: 'grid' });
    // the Cookbooks tab's tiles or list (#25) is remembered the same way
    expect((await saveSettings(db.sql, { cookbookView: 'list' })).cookbookView).toBe('list');
  });
  test('unknown settings are refused', async () => {
    await expect(saveSettings(db.sql, { sort: 'sideways' } as never)).rejects.toThrow();
    await expect(saveSettings(db.sql, { color: 'red' } as never)).rejects.toThrow();
  });
});
