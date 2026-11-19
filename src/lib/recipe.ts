// The recipe shape, shared by the app and the API (netlify/functions). Zod checks what the API receives.

import { z } from 'zod';
import { formatIngredient } from './ingredients';
import { AISLES, GroceryStore } from './groceries';

const id = z.string().min(1).max(64);

/** One row in a recipe's ingredient list: an ingredient, or a group header ("For the sauce"; its title is in `name`). */
export const Ingredient = z.object({
  id,
  kind: z.literal('header').optional(),
  amount: z.string().max(40),
  unit: z.string().max(40),
  name: z.string().max(300),
  note: z.string().max(300),
  /** the line exactly as typed or pasted; rebuilt from the fields when they're edited */
  raw: z.string().max(600).optional(),
  /**
   * Issue #11: another recipe this ingredient is made from ("1 pie crust" → the Pie Crust recipe), by id, never a copy.
   * The row keeps its own words, so it still reads right if that recipe is deleted.
   */
  recipeId: id.optional(),
});
export type Ingredient = z.infer<typeof Ingredient>;

/** One row in a recipe's directions: a step, or a group header ("Prep", "Grill"). */
export const Step = z.object({
  id,
  kind: z.literal('header').optional(),
  text: z.string().max(4000),
});
export type Step = z.infer<typeof Step>;

export const CropBox = z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() });

/** A recipe photo: the square crop that's shown (4:3 before issue #51), plus the full photo and the crop box so the crop can be redone. */
export const Photo = z.object({
  id,
  /** what shows: a sample photo (/photos/…), a stored photo (/api/photos/…), or, before saving, a data URL */
  src: z.string(),
  /** the full photo as picked (downscaled), when it was cropped on the phone */
  original: z.string().optional(),
  /** the crop box on the original, in its pixels */
  crop: CropBox.optional(),
});
export type Photo = z.infer<typeof Photo>;

export const Recipe = z.object({
  id,
  title: z.string().max(300),
  source: z.string().max(300),
  sourceUrl: z.string().max(2000).optional(),
  servings: z.number().positive().max(1000),
  servingSize: z.string().max(100),
  prepMinutes: z.number().int().min(0).max(100000),
  cookMinutes: z.number().int().min(0).max(100000),
  /** total time, kept in sync with prep + cook by the editor */
  minutes: z.number().int().min(0).max(200000),
  /** ISO timestamps */
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  lastMadeAt: z.string().nullable().optional(),
  /** Photos, the first is the cover (cards, the top of the recipe page). Empty: a grey chef-hat placeholder shows. */
  photos: z.array(Photo).max(30),
  /** Course types (from COURSES) and the user's own tags, all lowercase */
  tags: z.array(z.string().min(1).max(60)).max(60),
  ingredients: z.array(Ingredient).max(400),
  steps: z.array(Step).max(200),
  notes: z.string().max(20000),
  rating: z.number().int().min(0).max(5),
  timesMade: z.number().int().min(0),
  /**
   * Issue #14: Prepear's ids for a recipe imported from it (my edited copy's and the original's). Importing again skips
   * it, and Prepear's cookbooks and meal plan (kept from the export) find it by these.
   */
  prepearIds: z.array(id).max(10).optional(),
});
export type Recipe = z.infer<typeof Recipe>;

export const SortKey = z.enum(['newest', 'oldest', 'az']);
export type SortKey = z.infer<typeof SortKey>;

/** Issue #95: a cookbook's recipes can be sorted too; `manual` (the default) is the cookbook's own order, set in Organize. */
export const CookbookSort = z.enum(['manual', ...SortKey.options]);
export type CookbookSort = z.infer<typeof CookbookSort>;

export const SORT_LABELS: Record<CookbookSort, string> = { manual: 'Manual', newest: 'Newest first', oldest: 'Oldest first', az: 'A–Z' };

/** The recipes in this order (a new array); `manual` keeps the order they came in. */
export function sortRecipes(list: Recipe[], sort: CookbookSort): Recipe[] {
  if (sort === 'manual') return [...list];
  return [...list].sort((a, b) =>
    sort === 'az' ? a.title.localeCompare(b.title) : sort === 'newest' ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * App settings kept on the server, so they survive reinstalling.
 * R1: the recipe sort is remembered. R2: so is the last tag filter, matching all of the tags or any of them.
 */
export const Settings = z.object({
  sort: SortKey.default('newest'),
  filterTags: z.array(z.string().max(60)).max(60).default([]),
  filterMode: z.enum(['all', 'any']).default('all'),
  /** the Cookbooks tab as collage tiles or as a list (issue #25 redesign), remembered like the sort */
  cookbookView: z.enum(['grid', 'list']).default('grid'),
  /** issue #95: each cookbook's sort (its sections' too), by cookbook id; one not listed is in its manual order */
  cookbookSorts: z
    .record(z.string().min(1).max(64), CookbookSort)
    .refine((m) => Object.keys(m).length <= 1000, 'Too many cookbook sorts')
    .default({}),
  /** issue #64: the Instacart stores the grocery list's links search, and the one it's shopping at (its slug) */
  groceryStores: z.array(GroceryStore).max(10).default([]),
  groceryStore: z.string().max(80).default(''),
  /** the grocery list by aisle or by recipe, remembered */
  groceryView: z.enum(['aisle', 'recipe']).default('aisle'),
  /** aisles picked for things the app put in the wrong one, by name (nameKey), so it stays picked */
  groceryAisles: z.record(z.string().max(300), z.enum(AISLES)).default({}),
});
export type Settings = z.infer<typeof Settings>;

export const COURSES = ['breakfast', 'lunch', 'dinner', 'snack', 'appetizer', 'soup', 'salad', 'side', 'dessert', 'drink'];

export const coverPhoto = (r: Recipe): string | undefined => r.photos[0]?.src;

export const newId = () => crypto.randomUUID();

export const emptyRecipe = (): Recipe => ({
  id: newId(),
  title: '',
  source: '',
  servings: 4,
  servingSize: '',
  prepMinutes: 0,
  cookMinutes: 0,
  minutes: 0,
  createdAt: new Date().toISOString(),
  photos: [],
  tags: [],
  ingredients: [],
  steps: [],
  notes: '',
  rating: 0,
  timesMade: 0,
});

/** An ingredient after its fields were edited: the typed line becomes the edited line. */
export const withRaw = (i: Ingredient): Ingredient => (i.kind === 'header' ? i : { ...i, raw: formatIngredient(i) });

export const titleCase = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** Issue #11: the recipe an ingredient links to, if it still exists. */
export const linkedRecipe = (i: Ingredient, recipes: Recipe[]) => (i.recipeId ? recipes.find((r) => r.id === i.recipeId) : undefined);

const plain = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** A recipe whose title is this ingredient's name ("tahini sauce" → "Tahini Sauce"), to link pasted lines to. */
export const recipeNamed = (name: string, recipes: Recipe[]) => (plain(name) ? recipes.find((r) => plain(r.title) === plain(name)) : undefined);

/** Recipes that use this one as an ingredient. */
export const usedIn = (id: string, recipes: Recipe[]) => recipes.filter((r) => r.id !== id && r.ingredients.some((i) => i.recipeId === id));
