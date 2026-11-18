// The grocery list (issue #64), shared by the app and the API (netlify/functions).
//
// An item from a recipe holds the recipe's id, the ingredient's id and the servings it was added at, never the
// ingredient's words (CLAUDE.md data rules): the list reads them from the recipe, so editing the recipe shows on the list
// and the line stays exactly as typed there. An item typed on the list holds its own words. Deleting a recipe takes its
// items off the list (the database does that); an ingredient deleted from a recipe stops showing.
//
// Each line on the screen adds up the items for the same thing ("3 lemons" from two recipes), and tapping it opens
// Instacart's search for it at the store picked (a public search page: Instacart's developer API isn't open to new apps).

import { z } from 'zod';
import type { Ingredient, Recipe } from './recipe';
import { formatNumber, parseLine, readAmount, scaleAmount, unitFor } from './ingredients';
import { amountIn, neaterAmount, shortUnit } from './units';

const id = z.string().min(1).max(64);

// ── aisles ──

export const AISLES = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'spices', 'frozen', 'drinks', 'household', 'other'] as const;
export type Aisle = (typeof AISLES)[number];
export const AISLE_NAMES: Record<Aisle, string> = {
  produce: 'Produce',
  meat: 'Meat & seafood',
  dairy: 'Dairy & eggs',
  bakery: 'Bakery',
  pantry: 'Pantry',
  spices: 'Spices & seasonings',
  frozen: 'Frozen',
  drinks: 'Drinks',
  household: 'Household',
  other: 'Other',
};

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

/** An item as it reads now: its amount at its servings, its unit, name and note. */
export type Part = {
  item: GroceryItem;
  recipe?: Recipe;
  ingredient?: Ingredient;
  amount: string;
  unit: string;
  name: string;
  note: string;
};

/** How much an ingredient's amounts are multiplied by at these servings. */
export const factorFor = (recipe: Recipe, servings?: number) => (servings && recipe.servings ? servings / recipe.servings : 1);

/** An ingredient at some servings, as a part of the list (no item yet). */
export function ingredientPart(recipe: Recipe, ingredient: Ingredient, servings?: number) {
  const amount = scaleAmount(ingredient.amount, factorFor(recipe, servings));
  return { amount, unit: ingredient.unit, name: ingredient.name, note: ingredient.note };
}

/** The item as it reads now, or null when its recipe or ingredient is gone. */
export function partOf(item: GroceryItem, recipes: Map<string, Recipe>): Part | null {
  if (item.text) return { item, ...parseLine(item.text) };
  const recipe = recipes.get(item.recipeId!);
  const ingredient = recipe?.ingredients.find((i) => i.id === item.ingredientId && i.kind !== 'header');
  if (!recipe || !ingredient) return null;
  return { item, recipe, ingredient, ...ingredientPart(recipe, ingredient, item.servings) };
}

// ── names ──

const singular = (w: string) =>
  w.length <= 3 || w.endsWith('ss') || w.endsWith('us') ? w : w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.endsWith('oes') ? w.slice(0, -2) : w.endsWith('s') ? w.slice(0, -1) : w;

/**
 * The thing to buy, without what the recipe says about using it: "honey/maple syrup if you prefer it sweeter" → "honey/
 * maple syrup", "parsley, chopped" → "parsley", "salt to taste" → "salt". The recipe keeps its line as written.
 */
export const shopName = (name: string) =>
  name
    .replace(/\s*\((?:optional|about|to taste|for)[^)]*\)/gi, '')
    .replace(/\s*,.*$/, '')
    .replace(/\s+(?:if|to taste|for (?:serving|garnish|topping|the|dipping|drizzling)|plus more|or more|as needed|optional)\b.*$/i, '')
    .trim() || name.trim();

// words that say how it's prepared, not what to buy: "freshly squeezed lemon juice" is "lemon juice" on the list
const PREP = new Set(
  'freshly squeezed chopped minced diced sliced grated shredded crushed finely roughly coarsely thinly peeled packed softened melted divided optional organic raw about cold warm room temperature'
    .split(' '),
);
// the same thing to buy under another name (keys, singular): "white miso paste" and "white miso" are one line
const SAME: [string, string][] = [
  ['miso paste', 'miso'],
  ['ice cube', 'ice'],
];

/**
 * What two lines must share to be the same thing: "Lemons" and "lemon", "garlic (minced)" and "garlic", "freshly
 * squeezed lemon juice" and "lemon juice", "white miso paste" and "white miso", "soy sauce or tamari" and "soy sauce"
 * (the first choice: "lemon or lime juice" is lemon juice).
 */
export function nameKey(name: string): string {
  const words = (text: string) =>
    text
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter((w) => w && !PREP.has(w))
      .map(singular);
  const [first, second] = shopName(name).split(/\s+or\s+/i);
  let key = words(first);
  // "lemon or lime juice": the first choice takes the rest of the second's words
  const other = second ? words(second) : [];
  if (key.length === 1 && other.length > 1) key = [...key, ...other.slice(1)];
  let text = key.join(' ');
  for (const [from, to] of SAME) text = ` ${text} `.replace(` ${from} `, ` ${to} `).trim();
  return text;
}

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
  name: string;
  /** what to search Instacart for */
  term: string;
  aisle: Aisle;
  checked: boolean;
  /** the store it's pinned to, if any (its slug) */
  store?: string;
  /** the recipes it's for, in the order added (none: typed) */
  recipes: Recipe[];
};

// words that size a thing rather than measure it ("2 large onions"): the name agrees with the count after them
const SIZES = ['', 'large', 'medium', 'small', 'big', 'extra-large', 'whole'];

/**
 * A name that agrees with its count: "lemon" → "lemons" for 3, "large red onion" → "large red onions" for 2. Only for
 * counted things (no unit, or a size); "2 tbsp honey" and anything already plural stay as they are.
 */
export function countName(name: string, unit: string, amount: string): string {
  const n = readAmount(amount);
  if (!n || (n.high ?? n.low) <= 1 || !SIZES.includes(unit.trim().toLowerCase())) return name;
  const m = name.match(/^(.*?)([A-Za-z]+)$/);
  if (!m) return name;
  const [, before, word] = m;
  if (/s$/i.test(word)) return name;
  const plural = /(ch|sh|x|z)$/i.test(word) ? `${word}es` : /[^aeiou]y$/i.test(word) ? `${word.slice(0, -1)}ies` : /^(tomato|potato)$/i.test(word) ? `${word}es` : `${word}s`;
  return before + plural;
}

/** The name a line shows: plural when there's more than one ("3 lemons" from "1 lemon" and "2 lemons"). */
function lineName(parts: Part[], amount: string): string {
  return agreeingName(
    parts.map((p) => p.name),
    parts.map((p) => p.ingredient?.amount ?? p.amount),
    amount,
  );
}

/**
 * The name for an added-up amount, from the names and amounts as the recipes wrote them: plural when there's more than
 * one ("3 lemons" from "1 lemon" and "2 lemons"), but as written when the recipes all wrote it for more than one ("2
 * star anise" stays star anise).
 */
function agreeingName(names: string[], written: string[], amount: string): string {
  const shop = names.map((x) => shopName(x.trim())).filter(Boolean);
  if (!shop.length) return '';
  const n = readAmount(amount.split(' ')[0] ?? '');
  const many = n ? (n.high ?? n.low) > 1 : false;
  const plural = shop.find((x) => /s$/i.test(x) && singular(x.toLowerCase()) !== x.toLowerCase());
  if (many && plural) return plural;
  if (written.every((w) => ((a) => a !== null && (a.high ?? a.low) > 1)(readAmount(w)))) return shop[0];
  // the count reads off the added-up amount ("3", "2 large"): its first word, and its size word if it has one
  const [count, size = ''] = amount.split(' ');
  return countName(shop[0], SIZES.includes(size.toLowerCase()) ? size : amount.includes(' ') ? 'unit' : '', count);
}

/** The list's lines: items for the same thing added up, unticked and ticked apart, each at its store. */
export function linesOf(items: GroceryItem[], recipes: Recipe[], aisles: Record<string, Aisle> = {}): Line[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const groups = new Map<string, Part[]>();
  const sorted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const item of sorted) {
    const part = partOf(item, byId);
    if (!part) continue;
    const key = `${nameKey(part.name) || item.id}|${item.checked ? 1 : 0}|${item.store ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), part]);
  }
  return [...groups].map(([key, parts]) => {
    const amount = addUp(parts);
    const name = lineName(parts, amount);
    const recipesOf = [...new Map(parts.filter((p) => p.recipe).map((p) => [p.recipe!.id, p.recipe!])).values()];
    return {
      key,
      parts,
      amount,
      name,
      term: searchTerm(name),
      aisle: aisles[nameKey(name)] ?? aisleOf(name),
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

/** A part's own name as the list shows it: "lemons" for 2 of "lemon", "star anise" as a recipe wrote "2 star anise". */
export const partName = (p: Part) => agreeingName([p.name], [p.ingredient?.amount ?? p.amount], addUp([p]));

/** A part's own amount as the list shows it ("1½ lb", "½ cup" for 8 tablespoons), as an added-up line would. */
export const partAmount = (p: { amount: string; unit: string }) => addUp([p]);

// ── what's usually in the pantry ──

const STAPLES = [
  'salt', 'kosher salt', 'sea salt', 'table salt', 'flaky salt', 'pepper', 'black pepper', 'ground pepper', 'ground black pepper',
  'freshly ground black pepper', 'salt and pepper', 'salt pepper', 'water', 'warm water', 'cold water', 'hot water', 'boiling water',
  'ice', 'ice cubes', 'crushed ice', 'ice water', 'olive oil', 'extra virgin olive oil', 'vegetable oil', 'canola oil', 'neutral oil', 'oil', 'cooking spray',
  'nonstick cooking spray', 'flour', 'all purpose flour', 'baking soda', 'baking powder',
];
const STAPLE_KEYS = new Set(STAPLES.map(nameKey));

/** Salt, pepper, oil, flour, water, ice…: the add sheets start them unticked ("Usually on hand"). */
export const isStaple = (name: string) => STAPLE_KEYS.has(nameKey(name));

// ── which aisle ──

// Words that put a name in an aisle, checked in this order (so "chicken broth" is pantry, not meat; "frozen peas" is
// frozen, not produce). A word matches whole words, plurals included.
const AISLE_WORDS: [Aisle, string[]][] = [
  ['frozen', ['frozen', 'ice', 'ice cream', 'puff pastry', 'phyllo']],
  ['household', ['paper towel', 'toilet paper', 'napkin', 'foil', 'plastic wrap', 'parchment', 'trash bag', 'dish soap', 'detergent', 'sponge', 'zip bag', 'ziploc']],
  ['pantry', ['broth', 'stock', 'bouillon', 'canned', 'can', 'paste', 'sauce', 'ketchup', 'mustard', 'mayonnaise', 'mayo', 'vinegar', 'oil', 'honey', 'syrup', 'maple', 'molasses', 'jam', 'peanut butter', 'tahini', 'flour', 'sugar', 'cornstarch', 'baking soda', 'baking powder', 'yeast', 'vanilla', 'chocolate', 'cocoa', 'rice', 'pasta', 'spaghetti', 'penne', 'noodle', 'quinoa', 'couscous', 'oat', 'lentil', 'chickpea', 'bean', 'nut', 'almond', 'walnut', 'pecan', 'cashew', 'peanut', 'pistachio', 'seed', 'raisin', 'date', 'cranberry', 'breadcrumb', 'panko', 'cracker', 'cereal', 'coconut milk', 'soy sauce', 'tamari', 'fish sauce', 'sriracha', 'salsa', 'olive', 'caper', 'pickle', 'tomato paste', 'crushed tomato', 'diced tomato', 'tomato sauce', 'evaporated milk', 'condensed milk', 'gelatin', 'cooking spray', 'curry paste', 'harissa', 'water', 'mirin', 'rice wine', 'sake', 'nori', 'seaweed', 'stevia', 'sweetener', 'gochujang', 'hoisin', 'oyster sauce', 'coconut aminos']],
  ['spices', ['salt', 'pepper', 'peppercorn', 'cumin', 'paprika', 'cinnamon', 'nutmeg', 'clove', 'oregano', 'thyme', 'rosemary', 'sage', 'bay leaf', 'chili powder', 'chile powder', 'cayenne', 'turmeric', 'coriander', 'cardamom', 'allspice', 'ginger', 'garlic powder', 'onion powder', 'red pepper flake', 'chili flake', 'italian seasoning', 'seasoning', 'spice', 'curry powder', 'garam masala', 'za atar', 'sumac', 'smoked paprika', 'mustard seed', 'fennel seed', 'black pepper', 'white pepper', 'star anise', 'anise', 'five spice', 'furikake', 'togarashi', 'shichimi', 'everything bagel seasoning']],
  ['meat', ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'sausage', 'ham', 'steak', 'ground', 'mince', 'chorizo', 'prosciutto', 'salami', 'pancetta', 'veal', 'duck', 'fish', 'salmon', 'tuna', 'cod', 'halibut', 'tilapia', 'shrimp', 'prawn', 'scallop', 'crab', 'lobster', 'clam', 'mussel', 'anchov', 'roe', 'ikura', 'thigh', 'breast', 'drumstick', 'wing', 'brisket', 'tenderloin', 'pork chop', 'lamb chop']],
  ['dairy', ['milk', 'cream', 'butter', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'parmigiano', 'feta', 'ricotta', 'goat cheese', 'yogurt', 'yoghurt', 'egg', 'sour cream', 'creme fraiche', 'buttermilk', 'half and half', 'ghee', 'mascarpone', 'cream cheese', 'tofu', 'miso']],
  ['bakery', ['bread', 'bun', 'roll', 'bagel', 'tortilla', 'pita', 'naan', 'baguette', 'brioche', 'croissant', 'english muffin', 'flatbread', 'sourdough', 'pie crust']],
  ['drinks', ['wine', 'beer', 'juice', 'soda', 'sparkling water', 'coffee', 'tea', 'kombucha', 'liqueur', 'vodka', 'rum', 'tequila', 'whiskey', 'bourbon', 'gin']],
  ['produce', ['onion', 'shallot', 'garlic', 'ginger root', 'fresh ginger', 'scallion', 'green onion', 'leek', 'potato', 'sweet potato', 'carrot', 'celery', 'tomato', 'cucumber', 'zucchini', 'squash', 'pumpkin', 'pepper', 'bell pepper', 'jalapeno', 'chile', 'chili', 'poblano', 'serrano', 'lettuce', 'spinach', 'kale', 'arugula', 'chard', 'cabbage', 'broccoli', 'cauliflower', 'brussels sprout', 'asparagus', 'green bean', 'pea', 'corn', 'mushroom', 'eggplant', 'avocado', 'lemon', 'lime', 'orange', 'apple', 'pear', 'banana', 'berry', 'strawberry', 'blueberry', 'raspberry', 'grape', 'cherry', 'peach', 'plum', 'mango', 'pineapple', 'melon', 'watermelon', 'pomegranate', 'fig', 'lemon juice', 'lime juice', 'lemon zest', 'lime zest', 'herb', 'basil', 'cilantro', 'parsley', 'mint', 'dill', 'chive', 'radish', 'beet', 'fennel', 'turnip', 'parsnip', 'sprout', 'salad', 'greens', 'romaine', 'fresh']],
];
const AISLE_KEYS: [Aisle, string[]][] = AISLE_WORDS.map(([a, words]) => [a, words.map(nameKey)]);

/**
 * Which aisle something is in, from the words in its name; Other when none match. The longest match wins ("red bell
 * pepper" is produce though "pepper" is a spice; "coconut milk" is pantry though "milk" is dairy), and between matches as
 * long, the aisle listed first ("chicken broth" is pantry, "frozen peas" frozen).
 */
export function aisleOf(name: string): Aisle {
  const key = ` ${nameKey(name)} `;
  let best: { aisle: Aisle; words: number } | null = null;
  for (const [aisle, words] of AISLE_KEYS) {
    for (const w of words) {
      const n = w.split(' ').length;
      if (key.includes(` ${w} `) && (!best || n > best.words)) best = { aisle, words: n };
    }
  }
  return best?.aisle ?? 'other';
}

// ── adding recipes ──

/** One row in an add sheet: an ingredient of one or more recipes, added up, ticked unless it's usually in the pantry. */
export type AddRow = {
  key: string;
  amount: string;
  name: string;
  /** "Usually on hand", "Its own recipe: Pie Crust", "Adds to the 2 tbsp already on your list" */
  note: string;
  /** starts ticked */
  on: boolean;
  /** the items it adds when ticked */
  adds: Omit<GroceryItem, 'id' | 'createdAt' | 'checked'>[];
};

/** The ingredients of some recipes at some servings, added up, for the add sheets (one recipe, or Shop this week). */
export function addRows(
  sources: { recipe: Recipe; servings?: number; plannedId?: string }[],
  list: Line[],
  recipes: Recipe[],
): AddRow[] {
  const groups = new Map<string, { parts: { amount: string; unit: string; name: string }[]; written: string[]; adds: AddRow['adds']; linked?: Recipe }>();
  for (const { recipe, servings, plannedId } of sources) {
    for (const ing of recipe.ingredients) {
      if (ing.kind === 'header' || !ing.name.trim()) continue;
      const part = ingredientPart(recipe, ing, servings);
      const key = nameKey(ing.name) || `${recipe.id}:${ing.id}`;
      const g = groups.get(key) ?? { parts: [], written: [], adds: [] };
      g.parts.push(part);
      g.written.push(ing.amount);
      g.adds.push({ recipeId: recipe.id, ingredientId: ing.id, ...(servings ? { servings } : {}), ...(plannedId ? { plannedId } : {}) });
      if (ing.recipeId && !g.linked) g.linked = recipes.find((r) => r.id === ing.recipeId);
      groups.set(key, g);
    }
  }
  return [...groups].map(([key, g]) => {
    const amount = addUp(g.parts);
    const name = agreeingName(g.parts.map((p) => p.name), g.written, amount);
    const onList = list.find((l) => !l.checked && nameKey(l.name) === key);
    const staple = isStaple(name);
    const note = g.linked
      ? `Its own recipe: ${g.linked.title}`
      : staple
        ? 'Usually on hand'
        : onList
          ? onList.amount
            ? `Adds to the ${lineText(onList)} already on your list`
            : 'Already on your list'
          : '';
    return { key, amount, name, note, on: !staple && !g.linked, adds: g.adds };
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
