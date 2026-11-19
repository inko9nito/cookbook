// The grocery list (issue #64), shared by the app and the API (netlify/functions).
//
// An item from a recipe holds the recipe's id, the ingredient's id and the servings it was added at, never the
// ingredient's words (CLAUDE.md data rules): the list reads them from the recipe, so editing the recipe shows on the list
// and the line stays exactly as typed there. An item typed on the list holds its own words. Deleting a recipe takes its
// items off the list (the database does that); an ingredient deleted from a recipe stops showing.
//
// Each line on the screen adds up the items for the same thing ("3 lemons" from two recipes), and tapping it opens
// Instacart's search for it at the store picked (a public search page: Instacart's developer API isn't open to new apps).
// What "the same thing" is comes from the ingredients' names (grocery-names.ts: named by Claude once per name, with the
// general rules standing in until then). A recipe's choice ("soy sauce or tamari") stays its own line, as written, until
// one is picked; the picked one then adds up with the rest of it.

import { z } from 'zod';
import type { Ingredient, Recipe } from './recipe';
import { formatNumber, parseLine, readAmount, scaleAmount, unitFor } from './ingredients';
import { amountIn, neaterAmount, shortUnit } from './units';
import { AISLE_NAMES, AISLES, nameKey, shopName, thingsOf, type Aisle, type GroceryThing, type Names } from './grocery-names';

export { AISLE_NAMES, AISLES, aisleOf, isStaple, nameKey, shopName, type Aisle } from './grocery-names';

const id = z.string().min(1).max(64);

// ── stores ──

/** An Instacart store the user shops at: its name and its part of Instacart's address (instacart.com/store/<slug>). */
export const GroceryStore = z.object({
  name: z.string().trim().min(1).max(60),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/, 'should be the store’s part of its Instacart address'),
});
export type GroceryStore = z.infer<typeof GroceryStore>;

/**
 * The store's slug from what's pasted: its Instacart link ("https://www.instacart.com/store/acme-market/storefront")
 * or the slug itself. Null when it's neither.
 */
export function storeSlugFrom(text: string): string | null {
  const t = text.trim();
  const link = t.match(/instacart\.[a-z.]+\/store\/([a-z0-9][a-z0-9-]*)/i);
  const slug = (link ? link[1] : t).toLowerCase();
  if (['s', 'search', 'checkout', 'account', 'orders'].includes(slug)) return null;
  return /^[a-z0-9][a-z0-9-]{0,80}$/.test(slug) ? slug : null;
}

/** A name for a store from its slug, to start from: "acme-market" → "Acme Market". */
export const storeNameFrom = (slug: string) => slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

/** Instacart's search for something, at a store when one is picked: it opens the Instacart app on the iPhone. */
export const instacartSearch = (term: string, store?: string | null) =>
  `https://www.instacart.com/store/${store ? `${store}/` : ''}s?k=${encodeURIComponent(term)}`;

// ── items ──

/** Something on the list: an ingredient of a recipe (by ids, at some servings), or something typed. */
export const GroceryItem = z
  .object({
    id,
    recipeId: id.optional(),
    ingredientId: id.optional(),
    /** the servings it was added at; none: the recipe's own */
    servings: z.number().positive().max(1000).optional(),
    /** Shop this week: the Planner entry it came from, so the week shows what's already on the list */
    plannedId: id.optional(),
    /** typed on the list, exactly as typed ("2 avocados", "paper towels") */
    text: z.string().trim().min(1).max(300).optional(),
    /** pinned to a store other than the one the list is shopping at (its slug) */
    store: z.string().max(80).optional(),
    /** the choice picked when the recipe offers some ("tamari" of "soy sauce or tamari"); none: still open */
    choice: z.string().trim().min(1).max(100).optional(),
    checked: z.boolean(),
    /** ISO timestamp */
    createdAt: z.string(),
  })
  .refine((g) => (g.recipeId && g.ingredientId && !g.text) || (!g.recipeId && !g.ingredientId && g.text), {
    message: 'needs a recipe’s ingredient or typed text',
  });
export type GroceryItem = z.infer<typeof GroceryItem>;

/** A change to the list, sent to the server in one go: items to save (new or changed) and items to take off. */
export const GroceryChange = z.object({
  save: z.array(GroceryItem).max(500).default([]),
  remove: z.array(id).max(500).default([]),
});
export type GroceryChange = z.infer<typeof GroceryChange>;

// ── reading items ──

/** An item as it reads now: its amount at its servings, its unit, name and note, and what it is. */
export type Part = {
  item: GroceryItem;
  recipe?: Recipe;
  ingredient?: Ingredient;
  amount: string;
  unit: string;
  name: string;
  note: string;
  /** what it is: one thing, or the choices the recipe offers */
  things: GroceryThing[];
  /** what it's bought as: its one thing, or the choice picked; none while the choice is open */
  thing?: GroceryThing;
};

/** The thing picked from some choices (or the only one). */
export const chosen = (things: GroceryThing[], choice?: string) => (things.length === 1 ? things[0] : things.find((t) => t.item === choice));

/** How much an ingredient's amounts are multiplied by at these servings. */
export const factorFor = (recipe: Recipe, servings?: number) => (servings && recipe.servings ? servings / recipe.servings : 1);

/** An ingredient at some servings, as a part of the list (no item yet). */
export function ingredientPart(recipe: Recipe, ingredient: Ingredient, servings?: number) {
  const amount = scaleAmount(ingredient.amount, factorFor(recipe, servings));
  return { amount, unit: ingredient.unit, name: ingredient.name, note: ingredient.note };
}

/** The item as it reads now, or null when its recipe or ingredient is gone. */
export function partOf(item: GroceryItem, recipes: Map<string, Recipe>, names: Names = new Map()): Part | null {
  const what = (name: string) => {
    const things = thingsOf(name, names);
    return { things, thing: chosen(things, item.choice) };
  };
  if (item.text) {
    const read = parseLine(item.text);
    return { item, ...read, ...what(read.name || item.text) };
  }
  const recipe = recipes.get(item.recipeId!);
  const ingredient = recipe?.ingredients.find((i) => i.id === item.ingredientId && i.kind !== 'header');
  if (!recipe || !ingredient) return null;
  return { item, recipe, ingredient, ...ingredientPart(recipe, ingredient, item.servings), ...what(ingredient.name) };
}

/** The ingredient names (or typed words) of some items, to name them. */
export function itemNames(items: GroceryItem[], recipes: Recipe[]): string[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  return items.flatMap((i) => {
    const p = partOf(i, byId);
    return p?.name.trim() ? [p.name] : [];
  });
}

/** What makes two parts the same line: the thing they're bought as, or the same open choice. */
export const thingKey = (things: GroceryThing[], thing?: GroceryThing) =>
  thing ? nameKey(thing.item) : `either:${things.map((t) => nameKey(t.item)).join('|')}`;

/** What to search Instacart for: the name without anything in brackets ("yellow onion", not "1 onion (about 8 oz)"). */
export const searchTerm = (name: string) => shopName(name).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

// ── adding up ──

type Amount = { amount: string; unit: string };

const unitKey = (unit: string) => unitFor(unit, '1').toLowerCase().replace(/\.$/, '');
const range = (low: number, high: number | null) => (high === null ? formatNumber(low) : `${formatNumber(low)}–${formatNumber(high)}`);

/**
 * Amounts added up (R5: amounts that aren't numbers are never added or scaled): "2 tbsp" + "¼ cup" → "6 tbsp", "1 lemon"
 * + "2" → "3", "1 cup" + "3 oz" → "1 cup + 3 oz", "1 cup" + "a splash" → "1 cup + a splash". Empty when none has an
 * amount.
 */
export function addUp(amounts: Amount[]): string {
  const sums: { unit: string; low: number; high: number | null }[] = [];
  const words: string[] = [];
  for (const a of amounts) {
    const n = readAmount(a.amount);
    if (!n) {
      const text = [a.amount, a.unit].filter(Boolean).join(' ');
      if (text && !words.includes(text)) words.push(text);
      continue;
    }
    let sum = sums.find((s) => unitKey(s.unit) === unitKey(a.unit));
    let add: { low: number; high: number | null } | null = sum ? n : null;
    if (!sum) {
      for (const s of sums) {
        add = amountIn(a.amount, a.unit, s.unit);
        if (add) {
          sum = s;
          break;
        }
      }
    }
    if (!sum || !add) {
      sums.push({ unit: a.unit, low: n.low, high: n.high });
      continue;
    }
    // a range plus a plain amount is a range: 1–2 + 1 → 2–3
    const high = sum.high === null && add.high === null ? null : (sum.high ?? sum.low) + (add.high ?? add.low);
    sum.low += add.low;
    sum.high = high;
  }
  const added = sums.map((s) => {
    const amount = range(s.low, s.high);
    const neater = neaterAmount(amount, s.unit);
    if (neater && !neater.approx) return `${neater.amount} ${neater.unit}`;
    return [amount, shortUnit(s.unit, amount)].filter(Boolean).join(' ');
  });
  return [...added, ...words].join(' + ');
}

// ── lines ──

/** A line on the list: every unticked (or ticked) item for the same thing at the same store, added up. */
export type Line = {
  key: string;
  parts: Part[];
  /** the amounts added up: "3", "7 cloves", "1 cup + a splash" */
  amount: string;
  /** "lemons", "white miso"; an open choice as the recipe wrote it ("soy sauce or tamari") */
  name: string;
  /** the thing it is; none while it's an open choice */
  thing?: GroceryThing;
  /** an open choice: the things to choose from */
  choices?: GroceryThing[];
  /** what to search Instacart for (an open choice asks which) */
  term: string;
  aisle: Aisle;
  checked: boolean;
  /** the store it's pinned to, if any (its slug) */
  store?: string;
  /** the recipes it's for, in the order added (none: typed) */
  recipes: Recipe[];
};

// words that size a thing rather than measure it ("2 large onions"): it's still counted
const SIZES = ['large', 'medium', 'small', 'big', 'extra-large', 'whole'];

// written as more than one ("paper towels", "boneless chicken thighs")
const writtenPlural = (name: string) => {
  const last = shopName(name).trim().toLowerCase().split(/\s+/).pop() ?? '';
  return /s$/.test(last) && nameKey(last) !== last;
};

/**
 * A thing's name for an amount. Counted ("3", "2 large"): the plural for more than one ("3 lemons"), else the thing
 * ("½ lemon"). Measured or without an amount ("2 tbsp", "6 lb"): as the recipes wrote it, the plural if they wrote one
 * ("boneless chicken thighs", "white miso", "garlic").
 */
export function thingName(thing: GroceryThing, amount: string, written: string[]): string {
  const [count = '', ...rest] = amount.split(' + ')[0].split(' ').filter(Boolean);
  const n = readAmount(count);
  const counted = n && (rest.length === 0 || (rest.length === 1 && SIZES.includes(rest[0].toLowerCase())));
  if (counted) return (n.high ?? n.low) > 1 ? thing.plural : thing.item;
  return written.some(writtenPlural) ? thing.plural : thing.item;
}

/** The list's lines: items for the same thing added up, unticked and ticked apart, each at its store. */
export function linesOf(items: GroceryItem[], recipes: Recipe[], aisles: Record<string, Aisle> = {}, names: Names = new Map()): Line[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const groups = new Map<string, Part[]>();
  const sorted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const item of sorted) {
    const part = partOf(item, byId, names);
    if (!part) continue;
    const key = `${thingKey(part.things, part.thing) || item.id}|${item.checked ? 1 : 0}|${item.store ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), part]);
  }
  return [...groups].map(([key, parts]) => {
    const amount = addUp(parts);
    const { thing, things } = parts[0];
    const name = thing ? thingName(thing, amount, parts.map((p) => p.name)) : shopName(parts[0].name);
    const recipesOf = [...new Map(parts.filter((p) => p.recipe).map((p) => [p.recipe!.id, p.recipe!])).values()];
    return {
      key,
      parts,
      amount,
      name,
      ...(thing ? { thing } : { choices: things }),
      term: thing ? searchTerm(name) : things[0].item,
      aisle: aisles[nameKey(thing ? thing.item : name)] ?? (thing ?? things[0]).aisle,
      checked: parts[0].item.checked,
      ...(parts[0].item.store ? { store: parts[0].item.store } : {}),
      recipes: recipesOf,
    };
  });
}

/** Lines grouped by aisle, in the aisles' order, A to Z inside each. */
export function byAisle(lines: Line[]): { aisle: Aisle; lines: Line[] }[] {
  return AISLES.map((aisle) => ({
    aisle,
    lines: lines.filter((l) => l.aisle === aisle).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
  })).filter((g) => g.lines.length);
}

/**
 * Items grouped by recipe (in the order they were added), then the typed ones: each recipe's own amounts, not added up,
 * with what the whole list needs when another recipe needs it too.
 */
export function byRecipe(lines: Line[]): { recipe?: Recipe; parts: { part: Part; line: Line }[] }[] {
  const groups = new Map<string, { recipe?: Recipe; parts: { part: Part; line: Line }[]; first: string }>();
  for (const line of lines) {
    for (const part of line.parts) {
      const key = part.recipe?.id ?? '';
      const g = groups.get(key) ?? { recipe: part.recipe, parts: [], first: part.item.createdAt };
      g.parts.push({ part, line });
      if (part.item.createdAt < g.first) g.first = part.item.createdAt;
      groups.set(key, g);
    }
  }
  const order = (p: Part) => (p.recipe ? p.recipe.ingredients.findIndex((i) => i.id === p.item.ingredientId) : 0);
  return [...groups.values()]
    .sort((a, b) => (!a.recipe ? 1 : !b.recipe ? -1 : a.first.localeCompare(b.first)))
    .map(({ recipe, parts }) => ({ recipe, parts: parts.sort((a, b) => order(a.part) - order(b.part) || a.part.item.createdAt.localeCompare(b.part.item.createdAt)) }));
}

/** A part's own name as the list shows it: "lemons" for 2 of "lemon"; an open choice as written. */
export const partName = (p: Part) => (p.thing ? thingName(p.thing, addUp([p]), [p.name]) : shopName(p.name));

/** A part's own amount as the list shows it ("1½ lb", "½ cup" for 8 tablespoons), as an added-up line would. */
export const partAmount = (p: { amount: string; unit: string }) => addUp([p]);

// ── adding recipes ──

/** One row in an add screen: an ingredient of one or more recipes, added up, ticked unless it's usually on hand. */
export type AddRow = {
  key: string;
  amount: string;
  name: string;
  /** "Usually on hand", "Its own recipe: Pie Crust", "Adds to the 2 tbsp already on your list" */
  note: string;
  /** starts ticked */
  on: boolean;
  /** a choice the recipe offers ("soy sauce or tamari"): the things to choose from */
  choices?: GroceryThing[];
  /** the choice picked, if any */
  pick?: string;
  /** the items it adds when ticked */
  adds: Omit<GroceryItem, 'id' | 'createdAt' | 'checked'>[];
};

/**
 * The ingredients of some recipes at some servings, added up, for the add screens (one recipe, or Shop this week). A
 * choice is a row of its own, as written; `picks` (row key → the thing picked) makes it that thing, and says so when
 * that thing is already on the list.
 */
export function addRows(
  sources: { recipe: Recipe; servings?: number; plannedId?: string }[],
  list: Line[],
  recipes: Recipe[],
  names: Names = new Map(),
  picks: Record<string, string> = {},
): AddRow[] {
  type Group = { parts: { amount: string; unit: string; name: string }[]; things: GroceryThing[]; adds: AddRow['adds']; linked?: Recipe };
  const groups = new Map<string, Group>();
  for (const { recipe, servings, plannedId } of sources) {
    for (const ing of recipe.ingredients) {
      if (ing.kind === 'header' || !ing.name.trim()) continue;
      const part = ingredientPart(recipe, ing, servings);
      const things = thingsOf(ing.name, names);
      const key = thingKey(things, chosen(things)) || `${recipe.id}:${ing.id}`;
      const g = groups.get(key) ?? { parts: [], things, adds: [] };
      g.parts.push(part);
      g.adds.push({ recipeId: recipe.id, ingredientId: ing.id, ...(servings ? { servings } : {}), ...(plannedId ? { plannedId } : {}) });
      if (ing.recipeId && !g.linked) g.linked = recipes.find((r) => r.id === ing.recipeId);
      groups.set(key, g);
    }
  }
  return [...groups].map(([key, g]) => {
    const amount = addUp(g.parts);
    const choices = g.things.length > 1 ? g.things : undefined;
    const pick = choices && choices.some((t) => t.item === picks[key]) ? picks[key] : undefined;
    const thing = chosen(g.things, pick);
    const name = thing ? thingName(thing, amount, g.parts.map((p) => p.name)) : shopName(g.parts[0].name);
    const sameKey = thingKey(g.things, thing);
    const onList = list.find((l) => !l.checked && thingKey(l.choices ?? [], l.thing) === sameKey);
    const onHand = thing ? thing.onHand : g.things.every((t) => t.onHand);
    const note = g.linked
      ? `Its own recipe: ${g.linked.title}`
      : onHand
        ? 'Usually on hand'
        : onList
          ? onList.amount
            ? `Adds to the ${lineText(onList)} already on your list`
            : 'Already on your list'
          : '';
    return {
      key,
      amount,
      name,
      note,
      on: !onHand && !g.linked,
      ...(choices ? { choices } : {}),
      ...(pick ? { pick } : {}),
      adds: pick ? g.adds.map((a) => ({ ...a, choice: pick })) : g.adds,
    };
  });
}

/** New items for what an add sheet adds, in order (each a millisecond after the last, so they keep their order). */
export const newItems = (adds: AddRow['adds'], makeId: () => string, now = Date.now()): GroceryItem[] =>
  adds.map((a, i) => ({ id: makeId(), ...a, checked: false, createdAt: new Date(now + i).toISOString() }));

/** A line as it reads: "3 lemons", "paper towels". */
export const lineText = (l: Pick<Line, 'amount' | 'name'>) => [l.amount, l.name].filter(Boolean).join(' ');

/** What's left to get, by aisle, as text to share: "Produce\n3 lemons\n7 cloves garlic\n\nMeat & seafood\n…". */
export const listText = (lines: Line[]) =>
  byAisle(lines.filter((l) => !l.checked))
    .map((g) => [AISLE_NAMES[g.aisle], ...g.lines.map(lineText)].join('\n'))
    .join('\n\n');
