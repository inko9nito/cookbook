import { describe, expect, test } from 'vitest';
import { cleanUpPhotos, sweep, UNUSED_DAYS, type PhotoStore, type StateStore } from './photo-cleanup';
import { emptyRecipe, type Recipe } from '../../src/lib/recipe';

const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n));
const recipe = (...keys: string[]): Recipe => ({
  ...emptyRecipe(),
  title: 'Soup',
  photos: keys.map((k, i) => ({ id: String(i), src: `/api/photos/${k}`, original: `/api/photos/${k}-full` })),
});

describe('sweep: which stored photos to delete', () => {
  test('a photo a recipe uses is never deleted or listed as unused', () => {
    expect(sweep(['a'], new Set(['a']), {}, day(0))).toEqual({ remove: [], unused: {} });
  });

  test('an unused photo is noted the first time, and kept', () => {
    expect(sweep(['old'], new Set(), {}, day(0))).toEqual({ remove: [], unused: { old: day(0).toISOString() } });
  });

  test(`it's deleted only once it has been unused for ${UNUSED_DAYS} days`, () => {
    const noted = { old: day(0).toISOString() };
    expect(sweep(['old'], new Set(), noted, day(UNUSED_DAYS - 1)).remove).toEqual([]);
    expect(sweep(['old'], new Set(), noted, day(UNUSED_DAYS))).toEqual({ remove: ['old'], unused: {} });
  });

  test('a photo used again (an edit made from an older copy) starts over', () => {
    const noted = { back: day(0).toISOString() };
    expect(sweep(['back'], new Set(['back']), noted, day(20))).toEqual({ remove: [], unused: {} });
    expect(sweep(['back'], new Set(), {}, day(40)).unused).toEqual({ back: day(40).toISOString() });
  });

  test('photos already gone from the store drop off the unused list', () => {
    expect(sweep([], new Set(), { gone: day(0).toISOString() }, day(5)).unused).toEqual({});
  });
});

describe('cleanUpPhotos: one daily run', () => {
  const stores = (keys: string[], saved: unknown = null) => {
    const deleted: string[] = [];
    let state = saved;
    const photos: PhotoStore = {
      async *list() {
        yield { blobs: keys.slice(0, 2).map((key) => ({ key })) }; // in pages, as Netlify Blobs lists them
        yield { blobs: keys.slice(2).map((key) => ({ key })) };
      },
      delete: async (key) => {
        deleted.push(key);
      },
    };
    const kept: StateStore = { get: async () => state, setJSON: async (_k, v) => (state = v) };
    return { photos, kept, deleted, state: () => state };
  };

  test('keeps photos recipes use (shown crops and originals) and waits out the month for the rest', async () => {
    const s = stores(['a', 'a-full', 'replaced', 'long-gone'], { 'long-gone': day(0).toISOString() });
    const result = await cleanUpPhotos([recipe('a')], s.photos, s.kept, day(UNUSED_DAYS + 3));
    expect(s.deleted).toEqual(['long-gone']);
    expect(result).toEqual({ removed: ['long-gone'], waiting: 1, skipped: false });
    expect(s.state()).toEqual({ replaced: day(UNUSED_DAYS + 3).toISOString() });
  });

  test('with no recipes at all it touches nothing (a database problem, not an empty cookbook)', async () => {
    const s = stores(['a', 'b'], { a: day(0).toISOString() });
    expect(await cleanUpPhotos([], s.photos, s.kept, day(UNUSED_DAYS + 5))).toMatchObject({ skipped: true });
    expect(s.deleted).toEqual([]);
    expect(s.state()).toEqual({ a: day(0).toISOString() });
  });
});
