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
  /**
   * the collage cover's plates, middle first, then left and right: a recipe whose photo is on that plate, or '' for a
   * plate filled automatically (issue #80)
   */
  coverRecipeIds: z.array(z.union([id, z.literal('')])).max(3).optional(),
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
 * Issue #80: the cover editor numbers the plates left to right, 1 (left), 2 (the big one in the middle), 3 (right),
 * while a cookbook keeps its covers middle first (`coverRecipeIds`: [middle, left, right]). A plate is either chosen
 * (a recipe id) or automatic (null here, '' when kept): an automatic plate shows the cookbook's next photo not already
 * on the cover, so it follows the cookbook as recipes come and go.
 */
export type CoverSpots = [string | null, string | null, string | null];

const hasPhoto = (id: string | null | undefined, byId: Map<string, Recipe>): id is string => !!id && !!byId.get(id) && !!coverPhoto(byId.get(id)!);

/** The plates chosen for a cookbook, left to right (null: automatic). An older copy's single cover is the middle one. */
export function spotsOf(c: Pick<Cookbook, 'coverRecipeId' | 'coverRecipeIds'>, byId: Map<string, Recipe>): CoverSpots {
  const [middle, left, right] = coversOf(c).map((id) => (hasPhoto(id, byId) ? id : null));
  return [left ?? null, middle ?? null, right ?? null];
}

/** What to keep for chosen plates: middle first, '' for an automatic plate, nothing when all are automatic. */
export function coversFromSpots([left, middle, right]: CoverSpots): string[] {
  const kept = [middle ?? '', left ?? '', right ?? ''];
  while (kept.length && !kept[kept.length - 1]) kept.pop();
  return kept;
}

/**
 * The plates as shown, left to right: each one's recipe and whether it was chosen. Automatic plates take the cookbook's
 * first recipes with a photo not already on the cover, the middle plate first. With too few photos, a plate stays
 * empty, but never the middle one while a side plate has a photo.
 */
export function platesOf(spots: CoverSpots, c: Cookbook, byId: Map<string, Recipe>): { id: string | null; chosen: boolean }[] {
  const chosen = spots.map((id) => (hasPhoto(id, byId) ? id : null));
  const taken = chosen.filter((id): id is string => !!id);
  const fill = coverRecipeIds([], cookbookRecipeIds(c).filter((id) => !taken.includes(id)), byId, 3, taken.map((id) => coverPhoto(byId.get(id)!)!));
  // automatic plates fill the middle first, then the left, then the right, as cards always have
  const plates: { id: string | null; chosen: boolean }[] = chosen.map((id) => ({ id, chosen: !!id }));
  for (const at of [1, 0, 2]) if (!plates[at].id) plates[at] = { id: fill.shift() ?? null, chosen: false };
  // too few photos for three plates, and the middle one empty: a side plate's photo moves to the middle
  const side = [0, 2].find((at) => plates[at].id);
  if (!plates[1].id && side !== undefined) [plates[1], plates[side]] = [plates[side], { id: null, chosen: false }];
  return plates;
}

/** The cover's photos for the plates, middle first (as `CookbookPlates` takes them), '' for an empty plate. */
export function platePhotos(c: Cookbook, byId: Map<string, Recipe>): string[] {
  const [left, middle, right] = platesOf(spotsOf(c, byId), c, byId);
  return [middle, left, right].map((p) => (p.id ? coverPhoto(byId.get(p.id)!)! : ''));
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

/** "1 recipe", "3 recipes" */
export const recipeCount = (n: number) => `${n} ${n === 1 ? 'recipe' : 'recipes'}`;

/** The toast after Add Recipes: what changed between the ids before and after ("Added 2 recipes · Took out 1"), or nothing. */
export function changeNote(before: string[], after: string[]): string | undefined {
  const added = after.filter((id) => !before.includes(id)).length;
  const removed = before.filter((id) => !after.includes(id)).length;
  const parts = [added ? `Added ${recipeCount(added)}` : '', removed ? `Took out ${added ? removed : recipeCount(removed)}` : ''];
  return parts.filter(Boolean).join(' · ') || undefined;
}

/** A place's name for a toast: the cookbook's, or the section's and the cookbook's ("Meat in Dinners"). */
export const placeName = (c: Cookbook, sectionId: string | null) => {
  const s = sectionId === null ? undefined : c.sections.find((x) => x.id === sectionId);
  return s ? `${s.name} in ${c.name}` : c.sections.length && sectionId === null ? `Uncategorized in ${c.name}` : c.name;
};

/** "Grilling", "Grilling and Soups", "Grilling, Soups and 2 more" */
const names = (list: string[]) =>
  list.length <= 2 ? list.join(' and ') : `${list.slice(0, 2).join(', ')} and ${list.length - 2} more`;

/**
 * The toast after Add to Cookbook's Done: where the recipe went and where it left ("Added to Grilling · Taken out of Meat
 * in Dinners"), comparing the cookbooks before with the changed and new ones; nothing when nothing changed.
 */
export function addToNote(recipeId: string, before: Cookbook[], after: Cookbook[]): string | undefined {
  const was = new Map(before.map((c) => [c.id, c]));
  const added: string[] = [];
  const removed: string[] = [];
  for (const c of after) {
    const old = was.get(c.id);
    for (const sectionId of [null, ...c.sections.map((s) => s.id)]) {
      const now = isIn(c, sectionId, recipeId);
      const then = !!old && isIn(old, sectionId, recipeId);
      if (now && !then) added.push(placeName(c, sectionId));
      if (then && !now) removed.push(placeName(c, sectionId));
    }
  }
  const parts = [added.length ? `Added to ${names(added)}` : '', removed.length ? `Taken out of ${names(removed)}` : ''];
  return parts.filter(Boolean).join(' · ') || undefined;
}

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
