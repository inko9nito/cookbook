import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { NetlifyDB } from '@netlify/database-dev';
import { getDatabase } from '@netlify/database';
import { deleteRecipe, getSettings, listAllRecipes, listRecipes, NotYours, saveRecipe, saveSettings } from './recipes';
import { deleteCookbook, DuplicatePrepearCookbook, listCookbooks, saveCookbook } from './cookbooks';
import { deletePlanned, listPlanned, savePlanned, UnknownRecipe } from './planner';
import { changeGroceries, listGroceries } from './groceries';
import { correctName, listNames, nameIngredients } from './grocery-names';
import { emptyRecipe, type Recipe } from '../../src/lib/recipe';
import type { Cookbook } from '../../src/lib/cookbook';

// Issue #146: each account has a cookbook of its own. '' is the admin's (the original); another account's rows are
// kept under its Identity id. Neither sees, changes or points at the other's, even when the phone sends the other's ids.
const ADMIN = '';
const FRIEND = 'identity-id-of-a-friend';

let local: NetlifyDB;
let db: ReturnType<typeof getDatabase>;

const recipe = (id: string, over: Partial<Recipe> = {}): Recipe => ({ ...emptyRecipe(), id, title: `Recipe ${id}`, createdAt: '2026-11-20T10:00:00.000Z', ...over });
const book = (id: string, over: Partial<Cookbook> = {}): Cookbook => ({ id, name: `Book ${id}`, coverRecipeId: null, recipeIds: [], sections: [], createdAt: '2026-11-20T10:00:00.000Z', ...over });

beforeAll(async () => {
  local = new NetlifyDB();
  const connectionString = await local.start();
  await local.applyMigrations('./netlify/database/migrations');
  db = getDatabase({ connectionString });
  await saveRecipe(db.sql, ADMIN, recipe('mine', { photos: [{ id: 'p', src: '/api/photos/a.jpg' }] }));
  await saveRecipe(db.sql, FRIEND, recipe('theirs', { photos: [{ id: 'p', src: '/api/photos/b.jpg' }] }));
}, 60_000);

afterAll(async () => {
  await db?.pool.end();
  await local?.stop();
});

describe('recipes and settings are each account’s own', () => {
  test('each lists only its own recipes; the photo clean-up sees everyone’s', async () => {
    expect((await listRecipes(db.sql, ADMIN)).map((r) => r.id)).toEqual(['mine']);
    expect((await listRecipes(db.sql, FRIEND)).map((r) => r.id)).toEqual(['theirs']);
    expect((await listAllRecipes(db.sql)).map((r) => r.id).sort()).toEqual(['mine', 'theirs']);
  });

  test('saving with another account’s recipe id is refused and changes nothing', async () => {
    await expect(saveRecipe(db.sql, FRIEND, recipe('mine', { title: 'Taken over' }))).rejects.toBeInstanceOf(NotYours);
    expect((await listRecipes(db.sql, ADMIN))[0].title).toBe('Recipe mine');
  });

  test('deleting another account’s recipe does nothing', async () => {
    expect(await deleteRecipe(db.sql, FRIEND, 'mine')).toBeNull();
    expect((await listRecipes(db.sql, ADMIN)).map((r) => r.id)).toEqual(['mine']);
  });

  test('settings are kept apart', async () => {
    await saveSettings(db.sql, ADMIN, { groceryStores: [{ name: 'Admin store', slug: 'admin-store' }] });
    await saveSettings(db.sql, FRIEND, { groceryStores: [{ name: 'Friend store', slug: 'friend-store' }] });
    expect((await getSettings(db.sql, ADMIN)).groceryStores).toEqual([{ name: 'Admin store', slug: 'admin-store' }]);
    expect((await getSettings(db.sql, FRIEND)).groceryStores).toEqual([{ name: 'Friend store', slug: 'friend-store' }]);
  });
});

describe('cookbooks', () => {
  test('a cookbook only holds its owner’s recipes, and only its owner sees it', async () => {
    const saved = await saveCookbook(db, FRIEND, book('fb', { coverRecipeIds: ['mine', 'theirs'], recipeIds: ['mine', 'theirs'], sections: [{ id: 'fs', name: 'S', coverRecipeId: 'mine', recipeIds: ['mine', 'theirs'] }] }));
    expect(saved.recipeIds).toEqual(['theirs']);
    expect(saved.sections[0]).toMatchObject({ coverRecipeId: null, recipeIds: ['theirs'] });
    expect(saved.coverRecipeIds).toEqual(['', 'theirs']);
    expect((await listCookbooks(db, FRIEND)).map((c) => c.id)).toEqual(['fb']);
    expect(await listCookbooks(db, ADMIN)).toEqual([]);
  });

  test('saving or deleting another account’s cookbook changes nothing', async () => {
    await saveCookbook(db, ADMIN, book('ab', { recipeIds: ['mine'] }));
    await expect(saveCookbook(db, FRIEND, book('ab', { name: 'Taken over' }))).rejects.toBeInstanceOf(NotYours);
    expect(await deleteCookbook(db, FRIEND, 'ab')).toBe(false);
    expect((await listCookbooks(db, ADMIN)).map((c) => [c.name, c.recipeIds])).toEqual([['Book ab', ['mine']]]);
  });

  test('the same Prepear cookbook can be in two accounts, but not twice in one', async () => {
    await saveCookbook(db, ADMIN, book('ap', { prepearId: 'prep-1' }));
    await saveCookbook(db, FRIEND, book('fp', { prepearId: 'prep-1' }));
    await expect(saveCookbook(db, FRIEND, book('fp2', { prepearId: 'prep-1' }))).rejects.toBeInstanceOf(DuplicatePrepearCookbook);
  });
});

describe('the Planner', () => {
  test('only the owner’s recipes can be planned, and each sees only its own', async () => {
    await expect(savePlanned(db.sql, FRIEND, { id: 'fp1', day: '2026-11-21', recipeId: 'mine', createdAt: '2026-11-20T10:00:00.000Z' })).rejects.toBeInstanceOf(UnknownRecipe);
    await savePlanned(db.sql, FRIEND, { id: 'fp2', day: '2026-11-21', recipeId: 'theirs', createdAt: '2026-11-20T10:00:00.000Z' });
    await savePlanned(db.sql, ADMIN, { id: 'ap1', day: '2026-11-21', note: 'Out', createdAt: '2026-11-20T10:00:00.000Z' });
    expect((await listPlanned(db.sql, FRIEND)).map((p) => p.id)).toEqual(['fp2']);
    expect((await listPlanned(db.sql, ADMIN)).map((p) => p.id)).toEqual(['ap1']);
  });

  test('moving or deleting another account’s plan changes nothing', async () => {
    await expect(savePlanned(db.sql, FRIEND, { id: 'ap1', day: '2026-12-01', note: 'Mine now', createdAt: '2026-11-20T10:00:00.000Z' })).rejects.toBeInstanceOf(NotYours);
    expect(await deletePlanned(db.sql, FRIEND, 'ap1')).toBe(false);
    expect(await listPlanned(db.sql, ADMIN)).toMatchObject([{ id: 'ap1', day: '2026-11-21', note: 'Out' }]);
  });
});

describe('the grocery list', () => {
  test('each sees only its own; another account’s items and recipes are left alone', async () => {
    await changeGroceries(db, ADMIN, { save: [{ id: 'ag', text: 'milk', checked: false, createdAt: '2026-11-20T10:00:00.000Z' }] });
    await changeGroceries(db, FRIEND, {
      save: [
        { id: 'ag', text: 'taken over', checked: true, createdAt: '2026-11-20T10:00:00.000Z' },
        { id: 'fg1', recipeId: 'mine', ingredientId: 'i', checked: false, createdAt: '2026-11-20T10:00:01.000Z' },
        { id: 'fg2', recipeId: 'theirs', ingredientId: 'i', checked: false, createdAt: '2026-11-20T10:00:02.000Z' },
      ],
    });
    await changeGroceries(db, FRIEND, { remove: ['ag'] });
    expect(await listGroceries(db, ADMIN)).toEqual([{ id: 'ag', text: 'milk', checked: false, createdAt: '2026-11-20T10:00:00.000Z' }]);
    expect((await listGroceries(db, FRIEND)).map((g) => g.id)).toEqual(['fg2']);
  });

  test('grocery names and corrections are each account’s own', async () => {
    const thing = (item: string) => ({ item, plural: `${item}s`, aisle: 'produce' as const, onHand: false });
    await nameIngredients(db.sql, ADMIN, ['lemon'], async (names) => names.map((n) => ({ key: n, things: [thing(n)], by: 'claude' as const })));
    await correctName(db.sql, FRIEND, { key: 'lemon', things: [thing('lime')] });
    expect((await listNames(db.sql, ADMIN)).map((n) => n.things[0].item)).toEqual(['lemon']);
    expect((await listNames(db.sql, FRIEND)).map((n) => n.things[0].item)).toEqual(['lime']);
    // without Claude (an account that isn't the admin's), only its own names come back
    expect((await nameIngredients(db.sql, FRIEND, ['lemon', 'onion'], async () => [])).map((n) => n.key)).toEqual(['lemon']);
  });
});
