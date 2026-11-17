import { describe, expect, test } from 'vitest';
import { addToNote, BOOK_COLORS, changeNote, colorOf, cookbookRecipeIds, coverOf, coverPhotos, coversOf, fromOrganizeRows, organizeRows, placeName, placesOfRecipe, toggleIn, type Cookbook, type OrganizeRow } from './cookbook';
import { emptyRecipe, type Recipe } from './recipe';

const book: Cookbook = {
  id: 'b',
  name: 'Everything else',
  coverRecipeId: null,
  recipeIds: ['a', 'b'],
  sections: [
    { id: 'm', name: 'Meat', recipeIds: ['c', 'a'] },
    { id: 's', name: 'Seafood', recipeIds: ['d'] },
  ],
  createdAt: '2026-11-16T10:00:00.000Z',
};

const recipe = (id: string, photo?: string): Recipe => ({ ...emptyRecipe(), id, photos: photo ? [{ id: 'p', src: photo }] : [] });

describe('cookbooks', () => {
  test('every recipe once, Uncategorized first', () => {
    expect(cookbookRecipeIds(book)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('the cover is the chosen recipe’s photo, else the first recipe with one', () => {
    const byId = new Map([recipe('a'), recipe('b', '/b.jpg'), recipe('c', '/c.jpg')].map((r) => [r.id, r]));
    expect(coverOf('c', ['a', 'b', 'c'], byId)).toBe('/c.jpg');
    expect(coverOf('a', ['a', 'b', 'c'], byId)).toBe('/b.jpg');
    expect(coverOf(null, ['gone', 'a'], byId)).toBeUndefined();
  });

  test('a collage takes up to three different photos, the cover recipe’s first', () => {
    const byId = new Map([recipe('a'), recipe('b', '/b.jpg'), recipe('c', '/c.jpg'), recipe('d', '/b.jpg'), recipe('e', '/e.jpg'), recipe('f', '/f.jpg')].map((r) => [r.id, r]));
    expect(coverPhotos(['e'], ['a', 'b', 'c', 'd', 'e', 'f'], byId)).toEqual(['/e.jpg', '/b.jpg', '/c.jpg']);
    // three chosen covers, in the order picked
    expect(coverPhotos(['f', 'c', 'e'], ['a', 'b', 'c', 'd', 'e', 'f'], byId)).toEqual(['/f.jpg', '/c.jpg', '/e.jpg']);
    expect(coverPhotos([], ['a', 'b', 'd'], byId)).toEqual(['/b.jpg']);
    expect(coverPhotos([], [], byId)).toEqual([]);
  });

  test('the chosen covers: the list, else the one older copies have', () => {
    expect(coversOf({ coverRecipeId: 'a', coverRecipeIds: ['b', 'c'] })).toEqual(['b', 'c']);
    expect(coversOf({ coverRecipeId: 'a' })).toEqual(['a']);
    expect(coversOf({ coverRecipeId: null, coverRecipeIds: [] })).toEqual([]);
  });

  test('a card’s colour: the one chosen, else the same random one every time', () => {
    expect(colorOf({ id: 'x', color: 'sage' })).toBe('sage');
    expect(colorOf({ id: 'abc' })).toBe(colorOf({ id: 'abc' }));
    expect(BOOK_COLORS).toContain(colorOf({ id: 'abc' }));
    // different cookbooks get different colours, not all the same one
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => colorOf({ id }))).size).toBeGreaterThan(2);
  });

  test('toggling adds at the end, or takes out', () => {
    expect(toggleIn(book, 'm', 'b', true).sections[0].recipeIds).toEqual(['c', 'a', 'b']);
    expect(toggleIn(book, null, 'a', false).recipeIds).toEqual(['b']);
  });

  test('Organize rows turn back into the same cookbook', () => {
    expect(fromOrganizeRows(book, organizeRows(book))).toEqual(book);
  });

  test('dragging a recipe under another heading moves it to that section; moving a heading moves the section', () => {
    const rows = organizeRows(book);
    const keys = (r: OrganizeRow[]) => r.map((x) => x.key);
    expect(keys(rows)).toEqual(['h:', ':a', ':b', 'h:m', 'm:c', 'm:a', 'h:s', 's:d']);
    // drag "b" (Uncategorized) under Seafood, then Seafood's heading above Meat's
    const moved = [rows[0], rows[1], rows[6], rows[7], rows[2], rows[3], rows[4], rows[5]];
    expect(fromOrganizeRows(book, moved)).toEqual({
      ...book,
      recipeIds: ['a'],
      sections: [
        { id: 's', name: 'Seafood', recipeIds: ['d', 'b'] },
        { id: 'm', name: 'Meat', recipeIds: ['c', 'a'] },
      ],
    });
  });

  test('a recipe dragged where it already is is kept once; recipes above every heading are Uncategorized', () => {
    const rows = organizeRows(book);
    // "a" from Uncategorized dropped into Meat (which has "a"), and "c" dragged above the Uncategorized heading
    const moved = [rows[4], rows[0], rows[2], rows[3], rows[1], rows[5], rows[6], rows[7]];
    const out = fromOrganizeRows(book, moved);
    expect(out.recipeIds).toEqual(['c', 'b']);
    expect(out.sections[0].recipeIds).toEqual(['a']);
  });
});

describe('toast wording', () => {
  test('Add Recipes says what changed, or nothing', () => {
    expect(changeNote(['a'], ['a', 'b', 'c'])).toBe('Added 2 recipes');
    expect(changeNote(['a', 'b'], ['b'])).toBe('Took out 1 recipe');
    expect(changeNote(['a', 'b'], ['b', 'c'])).toBe('Added 1 recipe · Took out 1');
    expect(changeNote(['a', 'b'], ['b', 'a'])).toBeUndefined();
  });

  test('a place is the cookbook, or a section in it', () => {
    expect(placeName({ ...book, sections: [] }, null)).toBe(book.name);
    const withSection = { ...book, sections: [{ id: 's', name: 'Meat', coverRecipeId: null, recipeIds: [] }] };
    expect(placeName(withSection, 's')).toBe(`Meat in ${book.name}`);
    expect(placeName(withSection, null)).toBe(`Uncategorized in ${book.name}`);
  });

  test('Add to Cookbook says where the recipe went and where it left', () => {
    const a: Cookbook = { ...book, id: 'a', name: 'Grilling', recipeIds: [], sections: [] };
    const b: Cookbook = { ...book, id: 'b', name: 'Dinners', recipeIds: ['r'], sections: [{ id: 'm', name: 'Meat', coverRecipeId: null, recipeIds: [] }] };
    const c: Cookbook = { ...book, id: 'c', name: 'Soups', recipeIds: [], sections: [] };
    const d: Cookbook = { ...book, id: 'd', name: 'Sides', recipeIds: [], sections: [] };
    expect(addToNote('r', [a, b], [])).toBeUndefined();
    expect(addToNote('r', [a, b], [{ ...a, recipeIds: ['r'] }])).toBe('Added to Grilling');
    expect(addToNote('r', [a, b], [{ ...b, recipeIds: [], sections: [{ ...b.sections[0], recipeIds: ['r'] }] }])).toBe('Added to Meat in Dinners · Taken out of Uncategorized in Dinners');
    // a new cookbook isn't in "before"
    expect(addToNote('r', [a, b, c, d], [{ ...a, recipeIds: ['r'] }, { ...c, recipeIds: ['r'] }, { ...d, recipeIds: ['r'] }, { ...c, id: 'new', name: 'Brunch', recipeIds: ['r'] }])).toBe('Added to Grilling, Soups and 2 more');
  });
});

describe('where a recipe is (issue #41)', () => {
  test('cookbooks A–Z; in each, Uncategorized first, then sections in order', () => {
    const dinners: Cookbook = { ...book, id: 'd', name: 'dinners', recipeIds: ['r'], sections: [
      { id: 'm', name: 'Meat', coverRecipeId: null, recipeIds: ['r'] },
      { id: 'f', name: 'Fish', coverRecipeId: null, recipeIds: [] },
      { id: 'o', name: 'Other', coverRecipeId: null, recipeIds: ['x', 'r'] },
    ] };
    const bread: Cookbook = { ...book, id: 'b', name: 'Bread', recipeIds: ['r'], sections: [] };
    const none: Cookbook = { ...book, id: 'n', name: 'Apples', recipeIds: ['x'], sections: [] };
    expect(placesOfRecipe([dinners, none, bread], 'r').map((p) => [p.label, p.href])).toEqual([
      ['Bread', '/cookbook/b/'],
      ['dinners', '/cookbook/d/'],
      ['dinners · Meat', '/cookbook/d/section/m/'],
      ['dinners · Other', '/cookbook/d/section/o/'],
    ]);
    expect(placesOfRecipe([none], 'r')).toEqual([]);
  });
});
