import { describe, expect, test } from 'vitest';
import { Recipe, emptyRecipe, linkedRecipe, recipeNamed, usedIn, type Ingredient } from './recipe';

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
