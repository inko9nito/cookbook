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

export const Cookbook = z.object({
  id,
  name: z.string().trim().min(1).max(120),
  coverRecipeId: id.nullable().optional(),
  /** the recipes in no section ("Uncategorized"), in order */
  recipeIds,
  /** in order. A recipe can be in several sections, and in a section and Uncategorized too, as in Prepear. */
  sections: z.array(Section).max(100),
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
