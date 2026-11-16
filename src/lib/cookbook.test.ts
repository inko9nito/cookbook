import { describe, expect, test } from 'vitest';
import { cookbookRecipeIds, coverOf, fromOrganizeRows, organizeRows, toggleIn, type Cookbook, type OrganizeRow } from './cookbook';
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
