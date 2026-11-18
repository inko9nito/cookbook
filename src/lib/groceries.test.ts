import { describe, expect, test } from 'vitest';
import {
  addRows, addUp, aisleOf, byAisle, byRecipe, GroceryItem, instacartSearch, isStaple, lineText, linesOf, nameKey, partAmount, searchTerm, shopName, storeSlugFrom, type GroceryItem as Item,
} from './groceries';
import { emptyRecipe, type Ingredient, type Recipe } from './recipe';
import { namesMap, ruleThings, type Aisle, type GroceryThing } from './grocery-names';

const ing = (id: string, amount: string, unit: string, name: string, note = ''): Ingredient => ({ id, amount, unit, name, note });

const recipe = (id: string, title: string, servings: number, ingredients: Ingredient[]): Recipe => ({
  ...emptyRecipe(),
  id,
  title,
  servings,
  ingredients,
});

const chicken = recipe('r1', 'Mustard Dill Chicken', 4, [
  ing('i1', '1½', 'lb', 'boneless chicken thighs'),
  ing('i2', '1', '', 'lemon'),
  ing('i3', '3', 'cloves', 'garlic', 'minced'),
  ing('i4', '2', 'tbsp', 'butter'),
  ing('i5', '', '', 'salt'),
]);
const kebabs = recipe('r2', 'Chicken Kebabs', 8, [
  { id: 'h1', kind: 'header', amount: '', unit: '', name: 'For the marinade', note: '' },
  ing('k1', '1½', 'lb', 'boneless chicken thighs'),
  ing('k2', '2', '', 'lemons'),
  ing('k3', '4', 'cloves', 'garlic'),
  ing('k4', '¼', 'cup', 'butter', 'melted'),
  ing('k5', '1', 'cup', 'plain Greek yogurt'),
]);
const recipes = [chicken, kebabs];

let n = 0;
const item = (fields: Partial<Item>): Item => ({ id: `g${++n}`, checked: false, createdAt: `2026-11-18T10:00:${String(n).padStart(2, '0')}.000Z`, ...fields });
const fromRecipe = (r: Recipe, servings?: number) =>
  r.ingredients.filter((i) => i.kind !== 'header').map((i) => item({ recipeId: r.id, ingredientId: i.id, ...(servings ? { servings } : {}) }));

describe('adding up amounts', () => {
  test('the same unit, or none, adds up', () => {
    expect(addUp([{ amount: '1', unit: '' }, { amount: '2', unit: '' }])).toBe('3');
    expect(addUp([{ amount: '3', unit: 'cloves' }, { amount: '1', unit: 'clove' }])).toBe('4 cloves');
    expect(addUp([{ amount: '1½', unit: 'lb' }, { amount: '1½', unit: 'lb' }])).toBe('3 lb');
  });

  test('units of the same kind convert, and the total reads neatly', () => {
    expect(addUp([{ amount: '2', unit: 'tbsp' }, { amount: '¼', unit: 'cup' }])).toBe('6 tbsp');
    expect(addUp([{ amount: '6', unit: 'tbsp' }, { amount: '6', unit: 'tbsp' }])).toBe('¾ cup');
    expect(addUp([{ amount: '8', unit: 'oz' }, { amount: '1', unit: 'lb' }])).toBe('1½ lb');
  });

  test('units that don’t convert are listed side by side', () => {
    expect(addUp([{ amount: '1', unit: 'cup' }, { amount: '3', unit: 'oz' }])).toBe('1 cup + 3 oz');
  });

  test('ranges stay ranges (R5)', () => {
    expect(addUp([{ amount: '1-2', unit: 'tsp' }, { amount: '1', unit: 'tsp' }])).toBe('2–3 tsp');
  });

  test('amounts that aren’t numbers are never added (R5)', () => {
    expect(addUp([{ amount: '1', unit: 'cup' }, { amount: 'a splash', unit: '' }])).toBe('1 cup + a splash');
    expect(addUp([{ amount: '', unit: '' }, { amount: '', unit: '' }])).toBe('');
  });
});

describe('the list’s lines', () => {
  const items = [...fromRecipe(chicken), ...fromRecipe(kebabs)];
  const lines = linesOf(items, recipes);
  const line = (name: string) => lines.find((l) => nameKey(l.name) === nameKey(name))!;

  test('the same thing from two recipes is one line, added up, with both recipes', () => {
    expect(line('chicken thighs boneless') ?? line('boneless chicken thighs')).toBeTruthy();
    const thighs = line('boneless chicken thighs');
    expect(thighs.amount).toBe('3 lb');
    expect(thighs.recipes.map((r) => r.title)).toEqual(['Mustard Dill Chicken', 'Chicken Kebabs']);
    expect(line('lemon').amount).toBe('3');
    expect(line('lemon').name).toBe('lemons');
    expect(line('garlic').amount).toBe('7 cloves');
    expect(line('butter').amount).toBe('6 tbsp');
  });

  test('items read from the recipe at their servings, so the recipe’s words are never copied', () => {
    const doubled = linesOf(fromRecipe(chicken, 8), recipes);
    expect(doubled.find((l) => l.name === 'boneless chicken thighs')!.amount).toBe('3 lb');
    expect(GroceryItem.safeParse(fromRecipe(chicken)[0]).success).toBe(true);
    expect('name' in fromRecipe(chicken)[0]).toBe(false);
  });

  test('a recipe changed after adding shows the change; a deleted ingredient or recipe drops off', () => {
    const edited = { ...chicken, ingredients: chicken.ingredients.filter((i) => i.id !== 'i2').map((i) => (i.id === 'i1' ? { ...i, amount: '2' } : i)) };
    const after = linesOf(fromRecipe(chicken), [edited]);
    expect(after.find((l) => l.name === 'boneless chicken thighs')!.amount).toBe('2 lb');
    expect(after.some((l) => nameKey(l.name) === 'lemon')).toBe(false);
    expect(linesOf(fromRecipe(chicken), [])).toEqual([]);
  });

  test('ticked and unticked, or pinned to another store, are separate lines', () => {
    const a = item({ text: '2 avocados' });
    const b = item({ text: '1 avocado', checked: true });
    const c = item({ text: 'avocado', store: 'other-store' });
    const ls = linesOf([a, b, c], []);
    expect(ls.map((l) => `${l.amount}|${l.checked}|${l.store ?? ''}`)).toEqual(['2|false|', '1|true|', '|false|other-store']);
  });

  test('a typed item keeps its words and adds up with the same thing from a recipe', () => {
    const ls = linesOf([item({ text: '2 lemons' }), ...fromRecipe(chicken)], recipes);
    expect(ls.find((l) => nameKey(l.name) === 'lemon')!.amount).toBe('3');
  });

  test('by aisle: aisles in order, A to Z inside', () => {
    expect(byAisle(lines).map((g) => g.aisle)).toEqual(['produce', 'meat', 'dairy', 'spices']);
    expect(byAisle(lines)[0].lines.map((l) => l.name)).toEqual(['garlic', 'lemons']);
  });

  test('an aisle picked for a name is kept', () => {
    const moved = linesOf(items, recipes, { [nameKey('plain Greek yogurt')]: 'other' });
    expect(moved.find((l) => l.name === 'plain Greek yogurt')!.aisle).toBe('other');
  });

  test('by recipe: each recipe’s own amounts, in its order, typed items last', () => {
    const groups = byRecipe(linesOf([item({ text: 'paper towels' }), ...items], recipes));
    expect(groups.map((g) => g.recipe?.title ?? 'typed')).toEqual(['Mustard Dill Chicken', 'Chicken Kebabs', 'typed']);
    expect(groups[1].parts.map((p) => p.part.name)).toEqual(['boneless chicken thighs', 'lemons', 'garlic', 'butter', 'plain Greek yogurt']);
    expect(groups[1].parts[0].part.amount).toBe('1½');
    expect(groups[1].parts[0].line.amount).toBe('3 lb');
  });
});

describe('names, aisles and staples', () => {
  test('a counted thing’s name agrees with its count', () => {
    const ls = linesOf([item({ text: '1 lemon' }), item({ text: '2 lemon' }), item({ text: '1 large red onion' }), item({ text: '1 large red onion' }), item({ text: '2 tbsp honey' })], []);
    expect(ls.map(lineText)).toEqual(['3 lemons', '2 large red onions', '2 tbsp honey']);
  });

  test('names match whatever the plural or brackets', () => {
    expect(nameKey('Lemons')).toBe(nameKey('lemon'));
    expect(nameKey('tomatoes')).toBe(nameKey('tomato'));
    expect(nameKey('berries')).toBe(nameKey('berry'));
    expect(nameKey('garlic (minced)')).toBe('garlic');
    expect(searchTerm('yellow onion (about 8 oz)')).toBe('yellow onion');
  });

  test('aisles from the words in a name, the longest match winning', () => {
    expect(aisleOf('yellow onion')).toBe('produce');
    expect(aisleOf('red bell pepper')).toBe('produce');
    expect(aisleOf('freshly ground black pepper')).toBe('spices');
    expect(aisleOf('chicken broth')).toBe('pantry');
    expect(aisleOf('boneless chicken thighs')).toBe('meat');
    expect(aisleOf('coconut milk')).toBe('pantry');
    expect(aisleOf('whole milk')).toBe('dairy');
    expect(aisleOf('frozen peas')).toBe('frozen');
    expect(aisleOf('fresh ginger')).toBe('produce');
    expect(aisleOf('ground ginger')).toBe('spices');
    expect(aisleOf('eggs')).toBe('dairy');
    expect(aisleOf('eggplant')).toBe('produce');
    expect(aisleOf('paper towels')).toBe('household');
    expect(aisleOf('lemon juice')).toBe('produce');
    expect(aisleOf('corn tortillas')).toBe('bakery');
    expect(aisleOf('unobtainium')).toBe('other');
  });

  test('pantry staples', () => {
    expect(isStaple('Kosher salt')).toBe(true);
    expect(isStaple('extra-virgin olive oil')).toBe(true);
    expect(isStaple('all-purpose flour')).toBe(true);
    expect(isStaple('salted butter')).toBe(false);
    expect(isStaple('sesame oil')).toBe(false);
  });
});

describe('Instacart', () => {
  test('a search at a store, or anywhere', () => {
    expect(instacartSearch('yellow onion', 'acme-market')).toBe('https://www.instacart.com/store/acme-market/s?k=yellow%20onion');
    expect(instacartSearch('salt & pepper')).toBe('https://www.instacart.com/store/s?k=salt%20%26%20pepper');
  });

  test('a store from its link or its slug', () => {
    expect(storeSlugFrom('https://www.instacart.com/store/acme-market/storefront')).toBe('acme-market');
    expect(storeSlugFrom('Have a look: https://instacart.com/store/h-e-b/s?k=milk')).toBe('h-e-b');
    expect(storeSlugFrom('acme-market')).toBe('acme-market');
    expect(storeSlugFrom('https://www.instacart.com/store/s?k=milk')).toBe(null);
    expect(storeSlugFrom('not a store!')).toBe(null);
  });
});

describe('the add sheets', () => {
  test('a recipe’s ingredients at its servings, staples unticked, what’s on the list noted', () => {
    const list = linesOf([item({ text: '2 tbsp butter' })], []);
    const rows = addRows([{ recipe: chicken, servings: 8 }], list, recipes);
    expect(rows.map((r) => `${r.amount} ${r.name}|${r.on}|${r.note}`)).toEqual([
      '3 lb boneless chicken thighs|true|',
      '2 lemons|true|',
      '6 cloves garlic|true|',
      '¼ cup butter|true|Adds to the 2 tbsp butter already on your list',
      ' salt|false|Usually on hand',
    ]);
    expect(rows[0].adds).toEqual([{ recipeId: 'r1', ingredientId: 'i1', servings: 8 }]);
  });

  test('Shop this week adds up the same thing from several recipes and keeps where each came from', () => {
    const rows = addRows([{ recipe: chicken, plannedId: 'p1' }, { recipe: kebabs, servings: 4, plannedId: 'p2' }], [], recipes);
    const thighs = rows.find((r) => r.name === 'boneless chicken thighs')!;
    expect(thighs.amount).toBe('2¼ lb');
    expect(thighs.adds).toEqual([
      { recipeId: 'r1', ingredientId: 'i1', plannedId: 'p1' },
      { recipeId: 'r2', ingredientId: 'k1', servings: 4, plannedId: 'p2' },
    ]);
  });

  test('an ingredient that is its own recipe starts unticked and says so', () => {
    const crust = recipe('r3', 'Pie Crust', 8, [ing('c1', '2', 'cups', 'flour')]);
    const pie = recipe('r4', 'Apple Pie', 8, [{ ...ing('p1', '1', '', 'pie crust'), recipeId: 'r3' }]);
    const [row] = addRows([{ recipe: pie }], [], [crust, pie]);
    expect(row.on).toBe(false);
    expect(row.note).toBe('Its own recipe: Pie Crust');
  });
});

describe('what each ingredient is: named once (by Claude), the rules until then (issue #64)', () => {
  const thing = (item: string, aisle: Aisle, plural = item, onHand = false): GroceryThing => ({ item, plural, aisle, onHand });
  const names = namesMap([
    { key: 'white miso paste', things: [thing('white miso', 'dairy')], by: 'claude' },
    { key: 'white miso', things: [thing('white miso', 'dairy')], by: 'claude' },
    { key: 'soy sauce or tamari', things: [thing('soy sauce', 'pantry'), thing('tamari', 'pantry')], by: 'claude' },
    { key: 'soy sauce', things: [thing('soy sauce', 'pantry')], by: 'claude' },
    { key: 'star anise', things: [thing('star anise', 'spices')], by: 'claude' },
    { key: 'ice cubes', things: [thing('ice', 'frozen', 'ice', true)], by: 'claude' },
  ]);
  const miso = recipe('m', 'Miso Dressing', 4, [
    ing('a', '2', 'tablespoons', 'white miso paste'),
    ing('b', '2', 'tablespoons', 'soy sauce or tamari'),
    ing('c', '½', 'cup', 'ice cubes'),
  ]);
  const eggs = recipe('e', 'Deviled Eggs', 4, [ing('a', '3-4', 'tbsp', 'white miso'), ing('b', '1', 'cup', 'soy sauce'), ing('c', '2', '', 'star anise')]);
  const both = [miso, eggs];
  const on = (r: Recipe, i: string, extra: Partial<Item> = {}) => item({ recipeId: r.id, ingredientId: i, ...extra });

  test('the same thing under other words is one line, in the aisle it was named for', () => {
    const ls = linesOf([on(miso, 'a'), on(eggs, 'a')], both, {}, names);
    expect(ls.map(lineText)).toEqual(['5–6 tbsp white miso']);
    expect(ls[0].aisle).toBe('dairy');
  });

  test('a choice stays its own line, as written, until one is picked; the picked one adds up with the rest', () => {
    const open = linesOf([on(miso, 'b'), on(eggs, 'b')], both, {}, names);
    expect(open.map(lineText)).toEqual(['2 tbsp soy sauce or tamari', '1 cup soy sauce']);
    expect(open[0].choices!.map((t) => t.item)).toEqual(['soy sauce', 'tamari']);
    const soy = linesOf([on(miso, 'b', { choice: 'soy sauce' }), on(eggs, 'b')], both, {}, names);
    expect(soy.map(lineText)).toEqual(['18 tbsp soy sauce']);
    const tamari = linesOf([on(miso, 'b', { choice: 'tamari' }), on(eggs, 'b')], both, {}, names);
    expect(tamari.map(lineText)).toEqual(['2 tbsp tamari', '1 cup soy sauce']);
  });

  test('the plural is as named ("2 star anise"); what is usually on hand starts unticked', () => {
    expect(linesOf([on(eggs, 'c')], both, {}, names).map(lineText)).toEqual(['2 star anise']);
    const rows = addRows([{ recipe: miso }], [], both, names);
    expect(rows.find((r) => r.name === 'ice')).toMatchObject({ on: false, note: 'Usually on hand' });
  });

  test('the add screen: a choice is a row of its own; a pick makes it that thing and says so when it is on the list', () => {
    const list = linesOf([on(eggs, 'b')], both, {}, names);
    const rows = addRows([{ recipe: miso }], list, both, names);
    const choice = rows.find((r) => r.choices)!;
    expect(choice).toMatchObject({ name: 'soy sauce or tamari', note: '' });
    const picked = addRows([{ recipe: miso }], list, both, names, { [choice.key]: 'soy sauce' }).find((r) => r.key === choice.key)!;
    expect(picked).toMatchObject({ name: 'soy sauce', pick: 'soy sauce', note: 'Adds to the 1 cup soy sauce already on your list' });
    expect(picked.adds[0].choice).toBe('soy sauce');
  });

  test('until named, the rules: choices split, preparation and how it is used left out', () => {
    expect(ruleThings('soy sauce or tamari').map((t) => t.item)).toEqual(['soy sauce', 'tamari']);
    expect(ruleThings('lemon or lime juice').map((t) => t.item)).toEqual(['lemon juice', 'lime juice']);
    expect(ruleThings('freshly squeezed lemon juice').map((t) => t.item)).toEqual(['lemon juice']);
    expect(shopName('honey/maple syrup if you prefer it on the sweeter side')).toBe('honey/maple syrup');
    expect(shopName('parsley, chopped')).toBe('parsley');
  });

  test('units are short on the list: the amount is the small print', () => {
    expect(linesOf([item({ text: '2 tablespoons soy sauce' })], []).map(lineText)).toEqual(['2 tbsp soy sauce']);
    expect(partAmount({ amount: '8', unit: 'tablespoons' })).toBe('½ cup');
    expect(partAmount({ amount: '1/2', unit: '' })).toBe('½');
  });
});
