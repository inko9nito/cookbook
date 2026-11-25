import { describe, expect, test } from 'vitest';
import { Recipe, Settings, emptyRecipe, joinNotes, linkedRecipe, notesOf, recipeNamed, sortRecipes, splitNotes, usedIn, withNotes, type Ingredient } from './recipe';

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

describe('notes, each on its own (issue #165)', () => {
  const texts = (r: Pick<Recipe, 'notes' | 'noteList'>) => notesOf(r).map((n) => n.text);

  test('a recipe from before #165 has its text split at blank lines, with ids that stay the same', () => {
    const old = { notes: 'Halve the sugar.\n\nBake a day ahead.\nFreezes well.\n \n\nServe warm.' };
    expect(texts(old)).toEqual(['Halve the sugar.', 'Bake a day ahead.\nFreezes well.', 'Serve warm.']);
    expect(notesOf(old).map((n) => n.id)).toEqual(notesOf(old).map((n) => n.id));
    expect(texts({ notes: '  ' })).toEqual([]);
  });

  test('the list is read as it is, a note with a blank line in it included', () => {
    const r = withNotes(emptyRecipe(), [{ id: 'b', text: 'Two\n\nparagraphs' }, { id: 'a', text: 'One' }]);
    expect(r.notes).toBe('Two\n\nparagraphs\n\nOne');
    expect(notesOf(r).map((n) => n.id)).toEqual(['b', 'a']);
    expect(Recipe.parse(r).noteList).toHaveLength(2);
  });

  test('the text changed by an older version of the app wins over a list it carried along unchanged', () => {
    const r = { ...withNotes(emptyRecipe(), [{ id: 'a', text: 'One' }]), notes: 'One\n\nAdded on the old app' };
    expect(texts(r)).toEqual(['One', 'Added on the old app']);
  });

  test('empty notes are left out of the text', () => {
    expect(joinNotes([{ id: 'a', text: ' ' }, { id: 'b', text: ' Keep ' }])).toBe('Keep');
    expect(splitNotes('x\n\ny', (i) => `n${i}`)).toEqual([{ id: 'n0', text: 'x' }, { id: 'n1', text: 'y' }]);
  });
});
