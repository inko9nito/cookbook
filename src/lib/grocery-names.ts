// What each ingredient is on the grocery list (issue #64): the thing to buy, how it's written for more than one, its
// aisle, whether it's usually on hand, and the choices when a recipe offers some ("soy sauce or tamari"). Shared by the
// app and the API (netlify/lib/grocery-names.ts).
//
// Claude names each ingredient name once, when it's first needed (netlify/lib/grocery-names.ts, through Netlify's AI
// Gateway); the answer is kept in the grocery_names table under the name as recipes write it, so the same words are
// never asked about twice and the same product from different recipes ("white miso", "white miso paste") comes out as one
// thing. Corrections made on the phone (Same as…, Rename…) are kept the same way and win over Claude's answer. Until a
// name has an answer (offline, or the AI Gateway can't be reached) the general rules below stand in: they know plurals,
// preparation words and choices, and a short general word list for aisles, never words for particular recipes.

import { z } from 'zod';

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

// ── the shape ──

/** A thing to buy: "white miso" (plural "white miso"), "lemon" (plural "lemons"). */
export const GroceryThing = z.object({
  /** singular, lowercase but for names ("Greek yogurt"), as it's looked for in a store */
  item: z.string().trim().min(1).max(100),
  /** written for more than one */
  plural: z.string().trim().min(1).max(100),
  aisle: z.enum(AISLES),
  /** water, salt, ice…: the add screens start it unticked ("Usually on hand") */
  onHand: z.boolean(),
});
export type GroceryThing = z.infer<typeof GroceryThing>;

/** What an ingredient name is on the list: one thing, or the choices a recipe offers, in its order. */
export const GroceryName = z.object({
  /** the ingredient's name as recipes write it, lowercase (nameOf) */
  key: z.string().min(1).max(200),
  things: z.array(GroceryThing).min(1).max(4),
  /** who said so: Claude, or the person on the phone (which Claude never overwrites) */
  by: z.enum(['claude', 'you']),
});
export type GroceryName = z.infer<typeof GroceryName>;

/** The names known so far, by key. */
export type Names = Map<string, GroceryName>;
export const namesMap = (rows: GroceryName[]): Names => new Map(rows.map((r) => [r.key, r]));

/** The key an ingredient name is kept under: its words as written, lowercase, single-spaced. */
export const nameOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);

/** What an ingredient name is: as named (by Claude, or corrected), or by the general rules until then. */
export const thingsOf = (name: string, names: Names): GroceryThing[] => names.get(nameOf(name))?.things ?? ruleThings(name);

/** Whether a name still needs naming. */
export const isNamed = (name: string, names: Names) => !nameOf(name) || names.has(nameOf(name));

// ── the general rules (until Claude has named it) ──

const singular = (w: string) =>
  w.length <= 3 || w.endsWith('ss') || w.endsWith('us') ? w : w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.endsWith('oes') ? w.slice(0, -2) : w.endsWith('s') ? w.slice(0, -1) : w;
const pluralOf = (w: string) =>
  /s$/i.test(w) ? w : /(ch|sh|x|z)$/i.test(w) ? `${w}es` : /[^aeiou]y$/i.test(w) ? `${w.slice(0, -1)}ies` : /^(tomato|potato)$/i.test(w) ? `${w}es` : `${w}s`;

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
  'freshly squeezed chopped minced diced sliced grated shredded crushed finely roughly coarsely thinly peeled packed softened melted divided optional about room temperature'
    .split(' '),
);

/** A name's words to compare: lowercase, no brackets or preparation words, singular ("Lemons" and "lemon" match). */
export const nameKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !PREP.has(w))
    .map(singular)
    .join(' ');

/** A thing by the rules: its words (as nameKey, but readable), its plural, aisle and whether it's a staple. */
function ruleThing(text: string): GroceryThing {
  const words = text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !PREP.has(w.toLowerCase().replace(/[^a-z]/g, '')));
  const last = words.pop() ?? text.trim();
  const item = [...words, singular(last)].join(' ') || text.trim();
  const plural = [...words, pluralOf(singular(last))].join(' ');
  return { item, plural, aisle: aisleOf(item), onHand: isStaple(item) };
}

/**
 * An ingredient name by the general rules: one thing, or its choices ("soy sauce or tamari" → soy sauce, tamari; "lemon
 * or lime juice" → lemon juice, lime juice: a one-word first choice takes the rest of the second's words).
 */
export function ruleThings(name: string): GroceryThing[] {
  const shop = shopName(name);
  const choices = shop.split(/\s+or\s+|\s*\/\s*/i).map((c) => c.trim()).filter(Boolean);
  if (choices.length < 2) return [ruleThing(shop || name)];
  const last = choices[choices.length - 1].split(' ');
  return choices.slice(0, 4).map((c, i) => ruleThing(i < choices.length - 1 && !c.includes(' ') && last.length > 1 ? `${c} ${last.slice(1).join(' ')}` : c));
}

// ── what's usually on hand (the rules' guess) ──

const STAPLES = [
  'salt', 'kosher salt', 'sea salt', 'table salt', 'flaky salt', 'pepper', 'black pepper', 'ground pepper', 'ground black pepper',
  'freshly ground black pepper', 'salt and pepper', 'salt pepper', 'water', 'warm water', 'cold water', 'hot water', 'boiling water',
  'ice', 'ice water', 'olive oil', 'extra virgin olive oil', 'vegetable oil', 'canola oil', 'neutral oil', 'oil', 'cooking spray',
  'nonstick cooking spray', 'flour', 'all purpose flour', 'baking soda', 'baking powder',
];
const STAPLE_KEYS = new Set(STAPLES.map(nameKey));

/** Salt, pepper, oil, flour, water…, by the rules. */
export const isStaple = (name: string) => STAPLE_KEYS.has(nameKey(name));

// ── which aisle (the rules' guess) ──

// Words that put a name in an aisle, checked in this order (so "chicken broth" is pantry, not meat; "frozen peas" is
// frozen, not produce). A word matches whole words, plurals included.
const AISLE_WORDS: [Aisle, string[]][] = [
  ['frozen', ['frozen', 'ice cream', 'puff pastry', 'phyllo']],
  ['household', ['paper towel', 'toilet paper', 'napkin', 'foil', 'plastic wrap', 'parchment', 'trash bag', 'dish soap', 'detergent', 'sponge', 'zip bag', 'ziploc']],
  ['pantry', ['broth', 'stock', 'bouillon', 'canned', 'can', 'paste', 'sauce', 'ketchup', 'mustard', 'mayonnaise', 'mayo', 'vinegar', 'oil', 'honey', 'syrup', 'maple', 'molasses', 'jam', 'peanut butter', 'tahini', 'flour', 'sugar', 'cornstarch', 'baking soda', 'baking powder', 'yeast', 'vanilla', 'chocolate', 'cocoa', 'rice', 'pasta', 'spaghetti', 'penne', 'noodle', 'quinoa', 'couscous', 'oat', 'lentil', 'chickpea', 'bean', 'nut', 'almond', 'walnut', 'pecan', 'cashew', 'peanut', 'pistachio', 'seed', 'raisin', 'date', 'cranberry', 'breadcrumb', 'panko', 'cracker', 'cereal', 'coconut milk', 'soy sauce', 'tamari', 'fish sauce', 'sriracha', 'salsa', 'olive', 'caper', 'pickle', 'tomato paste', 'crushed tomato', 'diced tomato', 'tomato sauce', 'evaporated milk', 'condensed milk', 'gelatin', 'cooking spray', 'curry paste', 'harissa', 'water']],
  ['spices', ['salt', 'pepper', 'peppercorn', 'cumin', 'paprika', 'cinnamon', 'nutmeg', 'clove', 'oregano', 'thyme', 'rosemary', 'sage', 'bay leaf', 'chili powder', 'chile powder', 'cayenne', 'turmeric', 'coriander', 'cardamom', 'allspice', 'ginger', 'garlic powder', 'onion powder', 'red pepper flake', 'chili flake', 'italian seasoning', 'seasoning', 'spice', 'curry powder', 'garam masala', 'za atar', 'sumac', 'smoked paprika', 'mustard seed', 'fennel seed', 'black pepper', 'white pepper']],
  ['meat', ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'sausage', 'ham', 'steak', 'ground', 'mince', 'chorizo', 'prosciutto', 'salami', 'pancetta', 'veal', 'duck', 'fish', 'salmon', 'tuna', 'cod', 'halibut', 'tilapia', 'shrimp', 'prawn', 'scallop', 'crab', 'lobster', 'clam', 'mussel', 'anchov', 'thigh', 'breast', 'drumstick', 'wing', 'brisket', 'tenderloin', 'pork chop', 'lamb chop']],
  ['dairy', ['milk', 'cream', 'butter', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'parmigiano', 'feta', 'ricotta', 'goat cheese', 'yogurt', 'yoghurt', 'egg', 'sour cream', 'creme fraiche', 'buttermilk', 'half and half', 'ghee', 'mascarpone', 'cream cheese', 'tofu']],
  ['bakery', ['bread', 'bun', 'roll', 'bagel', 'tortilla', 'pita', 'naan', 'baguette', 'brioche', 'croissant', 'english muffin', 'flatbread', 'sourdough', 'pie crust']],
  ['drinks', ['wine', 'beer', 'juice', 'soda', 'sparkling water', 'coffee', 'tea', 'kombucha', 'liqueur', 'vodka', 'rum', 'tequila', 'whiskey', 'bourbon', 'gin']],
  ['produce', ['onion', 'shallot', 'garlic', 'ginger root', 'fresh ginger', 'scallion', 'green onion', 'leek', 'potato', 'sweet potato', 'carrot', 'celery', 'tomato', 'cucumber', 'zucchini', 'squash', 'pumpkin', 'pepper', 'bell pepper', 'jalapeno', 'chile', 'chili', 'poblano', 'serrano', 'lettuce', 'spinach', 'kale', 'arugula', 'chard', 'cabbage', 'broccoli', 'cauliflower', 'brussels sprout', 'asparagus', 'green bean', 'pea', 'corn', 'mushroom', 'eggplant', 'avocado', 'lemon', 'lime', 'orange', 'apple', 'pear', 'banana', 'berry', 'strawberry', 'blueberry', 'raspberry', 'grape', 'cherry', 'peach', 'plum', 'mango', 'pineapple', 'melon', 'watermelon', 'pomegranate', 'fig', 'lemon juice', 'lime juice', 'lemon zest', 'lime zest', 'herb', 'basil', 'cilantro', 'parsley', 'mint', 'dill', 'chive', 'radish', 'beet', 'fennel', 'turnip', 'parsnip', 'sprout', 'salad', 'greens', 'romaine', 'fresh']],
];
const AISLE_KEYS: [Aisle, string[]][] = AISLE_WORDS.map(([a, words]) => [a, words.map(nameKey)]);

/**
 * Which aisle something is in by the rules, from the words in its name; Other when none match. The longest match wins
 * ("red bell pepper" is produce though "pepper" is a spice), and between matches as long, the aisle listed first.
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
