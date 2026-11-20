import { describe, expect, test } from 'vitest';
import { Recipe, Settings, emptyRecipe, linkedRecipe, recipeNamed, sortRecipes, usedIn, type Ingredient } from './recipe';

const recipe = (id: string, title: string, ingredients: Ingredient[] = []): Recipe => ({ ...emptyRecipe(), id, title, ingredients });
const line = (name: string, recipeId?: string): Ingredient => ({ id: name, amount: '1', unit: '', name, note: '', ...(recipeId ? { recipeId } : {}) });

describe('recipes as ingredients (issue #11)', () => {
  const crust = recipe('crust', 'Flaky Pie Crust');
  const sauce = recipe('sauce', 'Tahini Sauce');
  const pie = recipe('pie', 'Apple Pie', [line('pie crust', 'crust'), line('apples')]);
  const all = [crust, sauce, pie];

  test('the link is kept when a recipe is checked (the API checks every save)', () => {
    expect(Recipe.parse(pie).ingredients[0].recipeId).toBe('crust');
  });

  test('an ingredient finds the recipe it links to, and nothing once that recipe is gone', () => {
    expect(linkedRecipe(pie.ingredients[0], all)?.title).toBe('Flaky Pie Crust');
    expect(linkedRecipe(pie.ingredients[1], all)).toBeUndefined();
    expect(linkedRecipe(pie.ingredients[0], [sauce, pie])).toBeUndefined();
  });

  test('a pasted line named like a recipe finds it, ignoring case and punctuation', () => {
    expect(recipeNamed('tahini sauce', all)?.id).toBe('sauce');
    expect(recipeNamed('Tahini-Sauce', all)?.id).toBe('sauce');
    expect(recipeNamed('tahini', all)).toBeUndefined();
    expect(recipeNamed('', all)).toBeUndefined();
  });

  test('a recipe knows where it is used', () => {
    expect(usedIn('crust', all).map((r) => r.title)).toEqual(['Apple Pie']);
    expect(usedIn('sauce', all)).toEqual([]);
  });
});

describe('sorting (R1, and in a cookbook #95)', () => {
  const dated = (id: string, title: string, createdAt: string): Recipe => ({ ...recipe(id, title), createdAt });
  // a cookbook's own order (Organize's): not by date, not by name
  const list = [dated('b', 'Beans', '2026-02-01'), dated('c', 'Chili', '2026-03-01'), dated('a', 'Apple Pie', '2026-01-01')];
  const order = (sort: Parameters<typeof sortRecipes>[1]) => sortRecipes(list, sort).map((r) => r.id).join('');

  test('manual keeps the order given; the others sort by date or name', () => {
    expect(order('manual')).toBe('bca');
    expect(order('newest')).toBe('cba');
    expect(order('oldest')).toBe('abc');
    expect(order('az')).toBe('abc');
    // most cooked first, ties newest first (#39)
    expect(sortRecipes([{ ...list[0], timesMade: 2 }, list[1], { ...list[2], timesMade: 5 }], 'cooked').map((r) => r.id).join('')).toBe('abc');
    expect(order('cooked')).toBe('cba');
    // a new array: the cookbook's own order is never changed in place
    expect(list.map((r) => r.id).join('')).toBe('bca');
  });

  test('a cookbook is in its manual order until a sort is picked for it', () => {
    expect(Settings.parse({}).cookbookSorts).toEqual({});
    expect(Settings.parse({ cookbookSorts: { b1: 'az' } }).cookbookSorts.b1).toBe('az');
    expect(() => Settings.parse({ cookbookSorts: { b1: 'sideways' } })).toThrow();
  });
});
