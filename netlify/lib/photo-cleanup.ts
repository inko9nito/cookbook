// Deleting stored photos no recipe uses any more, a month later rather than at once.
//
// Saving a recipe used to delete the photos it stopped using straight away (a re-crop, a rotate, a removed photo).
// Everything still pointing at the old photo then showed a blank: each deploy preview's copy of the recipes (previews
// share the photo store with production but have their own database), and any screen still holding the recipe from
// before the edit. Re-cropping became common once every photo turned square (#51), and photos started breaking. Now
// nothing is deleted on save; a daily clean-up (netlify/functions/photo-cleanup.mts) deletes a stored photo once no
// recipe has used it for UNUSED_DAYS.

import type { Recipe } from '../../src/lib/recipe';
import { photoKeys } from './recipes';

export const UNUSED_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Stored photos no recipe uses: photo key → when the clean-up first found it unused (ISO time). */
export type Unused = Record<string, string>;

/**
 * Which stored photos to delete now, and the unused list to keep for next time. A photo is deleted once it has been
 * unused for UNUSED_DAYS; one that a recipe uses again (an undo, an edit made from an older copy) starts over.
 */
export function sweep(stored: string[], used: Set<string>, unused: Unused, now: Date): { remove: string[]; unused: Unused } {
  const remove: string[] = [];
  const next: Unused = {};
  for (const key of stored) {
    if (used.has(key)) continue;
    const since = unused[key] ?? now.toISOString();
    if (now.getTime() - Date.parse(since) >= UNUSED_DAYS * DAY_MS) remove.push(key);
    else next[key] = since;
  }
  return { remove, unused: next };
}

/** The parts of Netlify Blobs the clean-up uses (a fake in the tests). */
export type PhotoStore = {
  list(options: { paginate: true }): AsyncIterable<{ blobs: { key: string }[] }>;
  delete(key: string): Promise<void>;
};
export type StateStore = {
  get(key: string, options: { type: 'json' }): Promise<unknown>;
  setJSON(key: string, value: unknown): Promise<unknown>;
};

const STATE_KEY = 'unused-photos';

/** One clean-up run: returns what it deleted and how many stored photos are waiting out their month. */
export async function cleanUpPhotos(recipes: Recipe[], photos: PhotoStore, state: StateStore, now = new Date()) {
  // With no recipes at all the database is more likely unreachable or empty by mistake than really empty: touch nothing.
  if (!recipes.length) return { removed: [] as string[], waiting: 0, skipped: true };
  const used = new Set(recipes.flatMap((r) => photoKeys(r)));
  const stored: string[] = [];
  for await (const page of photos.list({ paginate: true })) stored.push(...page.blobs.map((b) => b.key));
  const before = ((await state.get(STATE_KEY, { type: 'json' })) ?? {}) as Unused;
  const { remove, unused } = sweep(stored, used, before, now);
  for (const key of remove) await photos.delete(key);
  await state.setJSON(STATE_KEY, unused);
  return { removed: remove, waiting: Object.keys(unused).length, skipped: false };
}
