import { describe, expect, test } from 'vitest';
import { BOOK_COLORS, colorOf, cookbookRecipeIds, coverOf, coverPhotos, coversFromSpots, coversOf, fromOrganizeRows, platePhotos, platesOf, spotsOf, organizeRows, placesOfRecipe, toggleIn, type Cookbook, type OrganizeRow } from './cookbook';
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

  // issue #80: the cover editor numbers the plates left to right (1 left, 2 the big middle one, 3 right); covers are kept
  // middle first, '' for a plate filled in automatically
  describe('cover plates', () => {
    const photos = new Map([recipe('a', '/a.jpg'), recipe('b', '/b.jpg'), recipe('c', '/c.jpg'), recipe('d', '/d.jpg'), recipe('n')].map((r) => [r.id, r]));
    const four: Cookbook = { ...book, recipeIds: ['a', 'b', 'n'], sections: [{ id: 'm', name: 'Meat', recipeIds: ['c', 'd'] }] };
    const ids = (plates: { id: string | null; chosen: boolean }[]) => plates.map((p) => `${p.id ?? '-'}${p.chosen ? '!' : ''}`).join(' ');

    test('the chosen plates, left to right', () => {
      expect(spotsOf(four, photos)).toEqual([null, null, null]);
      // an older copy's single cover is the middle plate
      expect(spotsOf({ ...four, coverRecipeId: 'd' }, photos)).toEqual([null, 'd', null]);
      expect(spotsOf({ ...four, coverRecipeIds: ['c', 'd', 'a'] }, photos)).toEqual(['d', 'c', 'a']);
      expect(spotsOf({ ...four, coverRecipeIds: ['', 'd'] }, photos)).toEqual(['d', null, null]);
      // a recipe without a photo, or gone, is no choice
      expect(spotsOf({ ...four, coverRecipeIds: ['n', 'gone', 'a'] }, photos)).toEqual([null, null, 'a']);
    });

    test('kept middle first, an automatic plate as an empty entry', () => {
      expect(coversFromSpots(['d', 'c', 'a'])).toEqual(['c', 'd', 'a']);
      expect(coversFromSpots(['d', null, null])).toEqual(['', 'd']);
      expect(coversFromSpots([null, 'c', null])).toEqual(['c']);
      expect(coversFromSpots([null, null, null])).toEqual([]);
    });

    test('automatic plates take the next photos not already on the cover', () => {
      // nothing chosen: the cookbook's first three photos, the first in the middle
      expect(ids(platesOf([null, null, null], four, photos))).toBe('b a c');
      expect(ids(platesOf(['d', null, null], four, photos))).toBe('d! a b');
      expect(ids(platesOf([null, 'c', 'a'], four, photos))).toBe('b c! a!');
      // too few photos: a plate stays empty, but never the middle one while a side plate has a photo
      const two: Cookbook = { ...four, recipeIds: ['a', 'b'], sections: [] };
      expect(ids(platesOf([null, null, 'b'], two, photos))).toBe('- a b!');
      expect(ids(platesOf(['b', null, null], { ...two, recipeIds: ['b'] }, photos))).toBe('- b! -');
      expect(ids(platesOf([null, null, null], { ...four, recipeIds: ['n'], sections: [] }, photos))).toBe('- - -');
    });

    test('the photos for a cookbook’s card, middle first', () => {
      expect(platePhotos({ ...four, coverRecipeIds: ['', 'd'] }, photos)).toEqual(['/a.jpg', '/d.jpg', '/b.jpg']);
      expect(platePhotos({ ...four, recipeIds: ['a'], sections: [] }, photos)).toEqual(['/a.jpg', '', '']);
    });
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
