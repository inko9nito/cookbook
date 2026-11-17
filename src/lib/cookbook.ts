// The cookbook shape (issue #25), shared by the app and the API (netlify/functions). A cookbook only holds recipe ids,
// never recipe data (CLAUDE.md data rules): the app looks the recipes up, and a recipe deleted elsewhere just drops out.

import { z } from 'zod';
import { coverPhoto, type Recipe } from './recipe';

const id = z.string().min(1).max(64);
const recipeIds = z.array(id).max(2000);

/** A section of a cookbook ("Meat", "Seafood"): its recipes in order. */
export const Section = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  /** the recipe whose photo is the section's cover; none: its first recipe with a photo */
  coverRecipeId: id.nullable().optional(),
  recipeIds,
});
export type Section = z.infer<typeof Section>;

/** The soft colours a cookbook's card can be (tokens --ck-book-<name> in cookbook.css). */
export const BOOK_COLORS = ['blush', 'sage', 'butter', 'sky', 'oat', 'lilac'] as const;
export type BookColor = (typeof BOOK_COLORS)[number];

export const Cookbook = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  /** the first cover recipe (kept for older copies; `coverRecipeIds` is what the collage uses) */
  coverRecipeId: id.nullable().optional(),
  /** up to three recipes whose photos make the collage cover, in order: the first goes across the top */
  coverRecipeIds: z.array(id).max(3).optional(),
  /** the recipes in no section ("Uncategorized"), in order */
  recipeIds,
  /** in order. A recipe can be in several sections, and in a section and Uncategorized too, as in Prepear. */
  sections: z.array(Section).max(100),
  /** the card's colour, when it was chosen in the cookbook's ⋯ menu; otherwise one picked at random from its id */
  color: z.enum(BOOK_COLORS).optional(),
  /** Prepear's id for a cookbook brought in from it (#14's export), so it isn't brought in twice */
  prepearId: id.optional(),
  /** ISO timestamps */
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type Cookbook = z.infer<typeof Cookbook>;

/** Where a recipe goes in a cookbook: a section, or Uncategorized (null). */
export type Place = { cookbookId: string; sectionId: string | null };

export const emptyCookbook = (name: string, newId: () => string): Cookbook => ({
  id: newId(),
  name: name.trim(),
  coverRecipeId: null,
  recipeIds: [],
  sections: [],
  createdAt: new Date().toISOString(),
});

/** Every recipe in a cookbook, each once: Uncategorized first, then the sections in order. */
export const cookbookRecipeIds = (c: Cookbook): string[] => [...new Set([...c.recipeIds, ...c.sections.flatMap((s) => s.recipeIds)])];

/** The ids that still name a recipe (one deleted since is left out), in order. */
export const existing = (ids: string[], byId: Map<string, Recipe>): Recipe[] => ids.flatMap((i) => (byId.has(i) ? [byId.get(i)!] : []));

/** The cover photo: the chosen cover recipe's, else the first recipe's that has one. */
export function coverOf(coverRecipeId: string | null | undefined, ids: string[], byId: Map<string, Recipe>): string | undefined {
  const chosen = coverRecipeId ? byId.get(coverRecipeId) : undefined;
  if (chosen && coverPhoto(chosen)) return coverPhoto(chosen);
  for (const i of ids) {
    const r = byId.get(i);
    if (r && coverPhoto(r)) return coverPhoto(r);
  }
  return undefined;
}

/** The card's colour: the one chosen, else one picked at random from the id (the same every time). */
export function colorOf(c: Pick<Cookbook, 'id' | 'color'>): BookColor {
  if (c.color) return c.color;
  let h = 0;
  for (const ch of c.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BOOK_COLORS[h % BOOK_COLORS.length];
}

/** The cookbook's chosen cover recipes, in order (an older copy has just one). */
export const coversOf = (c: Pick<Cookbook, 'coverRecipeId' | 'coverRecipeIds'>): string[] =>
  c.coverRecipeIds?.length ? c.coverRecipeIds : c.coverRecipeId ? [c.coverRecipeId] : [];

/**
 * The recipes whose photos make a collage cover, up to `n` with different photos: the chosen cover recipes first, in
 * order, then the other recipes'. Fewer when fewer recipes have one. `taken` photos are skipped.
 */
export function coverRecipeIds(covers: string[], ids: string[], byId: Map<string, Recipe>, n = 3, taken: string[] = []): string[] {
  const out: string[] = [];
  const seen = new Set(taken);
  for (const id of [...covers, ...ids]) {
    const src = byId.get(id) && coverPhoto(byId.get(id)!);
    if (!src || seen.has(src) || out.includes(id)) continue;
    seen.add(src);
    out.push(id);
    if (out.length === n) break;
  }
  return out;
}

/** Up to `n` different photos for a collage cover (see `coverRecipeIds`). */
export const coverPhotos = (covers: string[], ids: string[], byId: Map<string, Recipe>, n = 3): string[] =>
  coverRecipeIds(covers, ids, byId, n).map((id) => coverPhoto(byId.get(id)!)!);

/**
 * Issue #80: the cover picker numbers the plates left to right, 1 (left), 2 (the big one in the middle), 3 (right),
 * while a cookbook keeps its covers middle first (`coverRecipeIds`: [middle, left, right]). A spot is empty (null)
 * while nothing is picked for it.
 */
export type CoverSpots = [string | null, string | null, string | null];

/** The plates as shown now, chosen or not (a cookbook that never chose shows its first recipes), as spots. */
export function spotsOf(c: Cookbook, byId: Map<string, Recipe>): CoverSpots {
  const [middle = null, left = null, right = null] = coverRecipeIds(coversOf(c), cookbookRecipeIds(c), byId);
  return [left, middle, right];
}

/**
 * The covers to keep for picked spots, middle first. An empty spot takes the cookbook's next recipe with a photo not
 * already on the cover (as the cover would show anyway), so the picked ones stay where they were put. A spot stays
 * empty only when the cookbook has no more photos, and then the ones after it move up.
 */
export function coversFromSpots(spots: CoverSpots, c: Cookbook, byId: Map<string, Recipe>): string[] {
  const picked = spots.filter((id): id is string => !!id && !!byId.get(id) && !!coverPhoto(byId.get(id)!));
  const fill = coverRecipeIds([], cookbookRecipeIds(c).filter((id) => !picked.includes(id)), byId, 3, picked.map((id) => coverPhoto(byId.get(id)!)!));
  const [left, middle, right] = spots.map((id) => (id && picked.includes(id) ? id : (fill.shift() ?? null)));
  return [middle, left, right].filter((id): id is string => !!id);
}

export const recipeIdsOf = (c: Cookbook, sectionId: string | null): string[] =>
  sectionId === null ? c.recipeIds : (c.sections.find((s) => s.id === sectionId)?.recipeIds ?? []);

/** The cookbook with a place's recipe ids replaced. */
export const withRecipeIds = (c: Cookbook, sectionId: string | null, ids: string[]): Cookbook => {
  const unique = [...new Set(ids)];
  return sectionId === null
    ? { ...c, recipeIds: unique }
    : { ...c, sections: c.sections.map((s) => (s.id === sectionId ? { ...s, recipeIds: unique } : s)) };
};

/** Is the recipe in that place? */
export const isIn = (c: Cookbook, sectionId: string | null, recipeId: string) => recipeIdsOf(c, sectionId).includes(recipeId);

/** Put a recipe in a place (at the end) or take it out. */
export const toggleIn = (c: Cookbook, sectionId: string | null, recipeId: string, on: boolean): Cookbook => {
  const ids = recipeIdsOf(c, sectionId).filter((i) => i !== recipeId);
  return withRecipeIds(c, sectionId, on ? [...ids, recipeId] : ids);
};

/** A place a recipe is in, for its page (issue #41): the cookbook, or a section of it ("Dinners · Meat"), and where it opens. */
export type RecipePlace = { key: string; cookbook: Cookbook; sectionId: string | null; label: string; href: string };

/** Every place the recipe is in: cookbooks A–Z, and in each its Uncategorized first, then its sections in order. */
export function placesOfRecipe(cookbooks: Cookbook[], recipeId: string): RecipePlace[] {
  return [...cookbooks].sort(byName).flatMap((c) => [
    ...(c.recipeIds.includes(recipeId) ? [{ key: c.id, cookbook: c, sectionId: null, label: c.name, href: `/cookbook/${c.id}/` }] : []),
    ...c.sections
      .filter((s) => s.recipeIds.includes(recipeId))
      .map((s) => ({ key: `${c.id}:${s.id}`, cookbook: c, sectionId: s.id, label: `${c.name} · ${s.name}`, href: `/cookbook/${c.id}/section/${s.id}/` })),
  ]);
}

/** Cookbooks A–Z, the way Prepear lists them. */
export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/**
 * Organize (issue #25) is one list: "Uncategorized" and each section as heading rows, each followed by its recipes.
 * These turn a cookbook into those rows and back, so a drag can reorder recipes, move them between sections, and move
 * whole sections.
 */
export type OrganizeRow = { kind: 'heading'; key: string; sectionId: string | null } | { kind: 'recipe'; key: string; recipeId: string };

export const organizeRows = (c: Cookbook): OrganizeRow[] => [
  { kind: 'heading', key: 'h:', sectionId: null },
  ...c.recipeIds.map((r) => ({ kind: 'recipe' as const, key: `:${r}`, recipeId: r })),
  ...c.sections.flatMap((s) => [
    { kind: 'heading' as const, key: `h:${s.id}`, sectionId: s.id },
    ...s.recipeIds.map((r) => ({ kind: 'recipe' as const, key: `${s.id}:${r}`, recipeId: r })),
  ]),
];

/** Rows back into the cookbook: each recipe goes where the heading above it says (above every heading: Uncategorized). */
export function fromOrganizeRows(c: Cookbook, rows: OrganizeRow[]): Cookbook {
  const places = new Map<string | null, string[]>([[null, []]]);
  const order: string[] = [];
  let current: string | null = null;
  for (const row of rows) {
    if (row.kind === 'heading') {
      current = row.sectionId;
      if (current !== null) order.push(current);
      if (!places.has(current)) places.set(current, []);
    } else {
      places.get(current)!.push(row.recipeId);
    }
  }
  const sections = order.flatMap((sid) => {
    const s = c.sections.find((x) => x.id === sid);
    return s ? [{ ...s, recipeIds: [...new Set(places.get(sid))] }] : [];
  });
  return { ...c, recipeIds: [...new Set(places.get(null))], sections };
}
