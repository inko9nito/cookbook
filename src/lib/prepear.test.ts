import { describe, expect, test } from 'vitest';
import { planPrepearImport, plainText, prepearIngredient, prepearRecipe, prepearTags, readPrepearExport, uuidTime, type PrepearExport } from './prepear';
import { Recipe, emptyRecipe } from './recipe';

// Made-up recipes in the shape of Prepear's answers (docs/PLAN.md §6). No real recipe data in this public repo.
const ME = '5575e830-0000-11e8-8000-000000000001';
const original = (over: Record<string, unknown> = {}) => ({
  recipe: {
    id: '5fd9e320-8ddb-11e9-8c19-000000000002',
    title: 'Grilled Chicken',
    attr_url: 'https://www.example.com/grilled-chicken/',
    deleted: null,
    imported_user_id: 'someone-else',
    imported_at: '2019-06-13T13:01:35.698Z',
    image_urls: { 120: '/prepear-prod/o/r/small.jpg', 640: '/prepear-prod/o/r/mid.jpg', 1080: '/prepear-prod/o/r/big.jpg' },
    ingredients: [{ title: '', ingredients: [{ amount: '1', measurement: 'cup', ingredient_name: 'yogurt', note: null }] }],
    directions: [{ title: '', directions: ['Mix.', 'Grill&nbsp;10 minutes.'] }],
    servings: 4,
    serving_size: null,
    time_prep: '20',
    time_cook: '15',
    tags: null,
    notes: null,
    ...over,
  },
  meta: { rating: 5, prepeared: true, notes: [], comments: '', preferred_adapted_id: '894a7560-9603-11ed-9b35-000000000003', tags: [] },
});
const adapted = (over: Record<string, unknown> = {}) => ({
  recipe: {
    id: '894a7560-9603-11ed-9b35-000000000003',
    title: 'Grilled Chicken, my way',
    attr_url: 'https://www.example.com/grilled-chicken/',
    deleted: null,
    image_urls: { 1080: '/prepear-prod/me/r/mine.jpg' },
    ingredients: [
      { title: 'Marinade', ingredients: [{ amount: '1', measurement: '', ingredient_name: '-3/4 teaspoons salt' }, { amount: '2', measurement: 'tbsp', ingredient_name: 'olive oil', note: 'extra virgin' }] },
      { title: 'Grill', ingredients: [{ amount: '', measurement: '', ingredient_name: 'oil, for the grates' }] },
    ],
    directions: [
      { title: 'Prep', directions: ['Combine &amp; marinate.<br>Overnight is best.'] },
      { title: 'Grill', directions: ['Grill until done.', '   '] },
    ],
    servings: null,
    serving_size: '2 skewers',
    time_prep: '',
    time_cook: null,
    tags: ['dinner', 'milk', '#gundry', 'lowsodium', 'tree_nut', 'phase1'],
    notes: ['Use thighs.'],
    ...over,
  },
  meta: { rating: null, prepeared: null, notes: ['Fry, don’t bake!'], comments: null, tags: [] },
});

const exp = (recipes: Record<string, unknown>, more: Partial<PrepearExport> = {}): PrepearExport => ({
  format: 'prepear-export',
  version: 1,
  exportedAt: '2026-11-16T05:00:00.000Z',
  profile: { id: ME, slug: 'me' },
  recipes,
  ...more,
});

describe('reading the file', () => {
  test('an export reads; anything else says so', () => {
    expect(readPrepearExport(JSON.stringify(exp({}))).profile.id).toBe(ME);
    expect(() => readPrepearExport('not json')).toThrow(/isn’t a Prepear export/);
    expect(() => readPrepearExport('{"format":"peek"}')).toThrow(/isn’t a Prepear export/);
    expect(() => readPrepearExport(JSON.stringify({ ...exp({}), version: 2 }))).toThrow(/newer/);
  });
});

describe('pieces', () => {
  test('HTML from recipe sites becomes plain text, keeping line breaks', () => {
    expect(plainText('Stir&nbsp;well &amp; serve.<br/>Enjoy &#39;hot&#x27;&hellip;')).toBe('Stir well & serve.\nEnjoy \'hot\'…');
    expect(plainText('<b>Bold</b>  text\n\n\n\nmore')).toBe('Bold text\n\nmore');
    expect(plainText(null)).toBe('');
  });

  test('Prepear ids carry the date they were made', () => {
    expect(uuidTime('894a7560-9603-11ed-9b35-000000000000')).toBe('2023-01-17T01:09:05.078Z');
    // (seen in a real export: the same moment Prepear gives as that recipe's imported_at)
    expect(uuidTime('9c0525f0-cb3e-11f1-b408-000000000000')).toBe('2026-10-18T21:55:19.119Z');
    expect(uuidTime('not-a-uuid')).toBeNull();
    expect(uuidTime('e1794cb0-cb3e-41f1-83d1-000000000000')).toBeNull(); // version 4: no date in it
  });

  test('tags: courses, diets and my own hashtags stay; allergens Prepear adds are left out', () => {
    expect(prepearTags(['dinner', 'milk', '#gundry', 'gundry', 'lowsodium', 'tree_nut', 'phase1', 'Gluten-Free', 7])).toEqual([
      'dinner',
      'gundry',
      'low sodium',
      'phase 1',
      'gluten-free',
    ]);
  });

  test('an ingredient keeps Prepear’s parts, and its line is rebuilt as the raw text', () => {
    expect(prepearIngredient({ amount: '1 1/2', measurement: 'cups', ingredient_name: 'plain yogurt', note: 'i used greek' })).toMatchObject({
      amount: '1 1/2',
      unit: 'cups',
      name: 'plain yogurt',
      note: 'i used greek',
      raw: '1 1/2 cups plain yogurt, i used greek',
    });
    // non-numeric amounts are kept as written (R5: never silently scaled)
    expect(prepearIngredient({ amount: 'Up to 1/2', measurement: 'cup', ingredient_name: 'water' })).toMatchObject({ amount: 'Up to 1/2', unit: 'cup', name: 'water' });
    expect(prepearIngredient({ amount: '', measurement: '', ingredient_name: '' })).toBeNull();
  });

  test('lines Prepear split badly are put back together and read again', () => {
    expect(prepearIngredient({ amount: '1', measurement: '', ingredient_name: '-3/4 teaspoons salt' })).toMatchObject({
      amount: '1 3/4',
      unit: 'teaspoons',
      name: 'salt',
      raw: '1-3/4 teaspoons salt',
    });
    // a range stays a range
    expect(prepearIngredient({ amount: '3', measurement: '', ingredient_name: '-4 tbsp sunflower oil, for frying' })).toMatchObject({ amount: '3-4', unit: 'tbsp', name: 'sunflower oil', note: 'for frying' });
    expect(prepearIngredient({ amount: '1/4 tsp', measurement: '', ingredient_name: 'cumin' })).toMatchObject({ amount: '1/4', unit: 'tsp', name: 'cumin', raw: '1/4 tsp cumin' });
  });
});

describe('a recipe', () => {
  test('my edited copy is the recipe; the original fills in my rating, “made it” and the dates', () => {
    const item = prepearRecipe({ adapted: adapted(), original: original() }, '5fd9e320-8ddb-11e9-8c19-000000000002', exp({}))!;
    const r = item.recipe;
    expect(Recipe.safeParse(r).success).toBe(true);
    expect(r).toMatchObject({
      title: 'Grilled Chicken, my way',
      source: 'example.com',
      sourceUrl: 'https://www.example.com/grilled-chicken/',
      servings: 4, // Prepear had none: the app's default
      servingSize: '2 skewers',
      prepMinutes: 0,
      cookMinutes: 0,
      rating: 5,
      timesMade: 1,
      tags: ['dinner', 'gundry', 'low sodium', 'phase 1'],
      notes: 'Use thighs.\n\nFry, don’t bake!',
    });
    expect(r.createdAt).toBe('2023-01-17T01:09:05.078Z'); // when I made my copy
    expect(r.prepearIds).toEqual(['5fd9e320-8ddb-11e9-8c19-000000000002', '894a7560-9603-11ed-9b35-000000000003']);
    expect(item.photo).toBe('/prepear-prod/me/r/mine.jpg');
    expect(r.ingredients.map((i) => (i.kind ? `# ${i.name}` : i.raw))).toEqual([
      '# Marinade',
      '1-3/4 teaspoons salt',
      '2 tbsp olive oil, extra virgin',
      '# Grill',
      'oil, for the grates',
    ]);
    expect(r.steps.map((s) => (s.kind ? `# ${s.text}` : s.text))).toEqual(['# Prep', 'Combine & marinate.\nOvernight is best.', '# Grill', 'Grill until done.']);
  });

  test('without an edited copy, the original is the recipe, dated when I imported it', () => {
    const mine = original({ imported_user_id: ME, imported_at: '2026-10-18T21:55:19.119Z', notes: 'One note' });
    const item = prepearRecipe({ adapted: { recipe: null }, original: mine }, mine.recipe.id, exp({}))!;
    expect(item.recipe).toMatchObject({ title: 'Grilled Chicken', createdAt: '2026-10-18T21:55:19.119Z', servings: 4, prepMinutes: 20, cookMinutes: 15, minutes: 35, notes: 'One note' });
    expect(item.recipe.steps.map((s) => s.text)).toEqual(['Mix.', 'Grill 10 minutes.']);
    expect(item.photo).toBe('/prepear-prod/o/r/big.jpg');
  });

  test('a deleted copy falls back to the original; deleted everywhere or untitled is nothing', () => {
    expect(prepearRecipe({ adapted: adapted({ deleted: '2024-01-01' }), original: original() }, 'x', exp({}))?.recipe.title).toBe('Grilled Chicken');
    expect(prepearRecipe({ adapted: null, original: original({ deleted: '2024-01-01' }) }, 'x', exp({}))).toBeNull();
    expect(prepearRecipe({ original: original({ title: '  ' }) }, 'x', exp({}))).toBeNull();
  });

  test('a title typed in lower case gets a capital; others stay as they are', () => {
    expect(prepearRecipe({ original: original({ title: 'mustard dill chicken thighs' }) }, 'x', exp({}))?.recipe.title).toBe('Mustard dill chicken thighs');
    expect(prepearRecipe({ original: original({ title: 'iPhone-friendly Instant Pot Chili' }) }, 'x', exp({}))?.recipe.title).toBe('iPhone-friendly Instant Pot Chili');
    expect(prepearRecipe({ original: original({ title: 'рулет со шпинатом' }) }, 'x', exp({}))?.recipe.title).toBe('Рулет со шпинатом');
  });

  test('a recipe without a photo has none to copy', () => {
    expect(prepearRecipe({ original: original({ image_urls: null }) }, 'x', exp({}))?.photo).toBeUndefined();
  });
});

describe('the import plan', () => {
  const file = exp(
    {
      a: { adapted: adapted(), original: original() },
      b: { original: { ...original({ id: 'b-id', title: 'Soup' }), meta: {} } },
      gone: { original: original({ id: 'gone-id', deleted: 'yes' }) },
    },
    { failed: [{ id: 'busy', error: '503' }] },
  );

  test('everything new is planned; deleted and unread recipes are listed with a reason', () => {
    const plan = planPrepearImport(file, []);
    expect(plan.items.map((i) => i.recipe.title)).toEqual(['Grilled Chicken, my way', 'Soup']);
    expect(plan.alreadyHere).toBe(0);
    expect(plan.skipped).toEqual([
      { id: 'busy', reason: 'Prepear didn’t send it (503)' },
      { id: 'gone', reason: 'deleted in Prepear, or empty' },
    ]);
  });

  test('importing again skips recipes already here, found by any of their Prepear ids', () => {
    const here = { ...emptyRecipe(), title: 'Renamed here', prepearIds: ['894a7560-9603-11ed-9b35-000000000003'] };
    const plan = planPrepearImport(file, [here]);
    expect(plan.items.map((i) => i.recipe.title)).toEqual(['Soup']);
    expect(plan.alreadyHere).toBe(1);
  });

  test('two answers for the same recipe are imported once', () => {
    const twice = exp({ a: { adapted: adapted(), original: original() }, b: { adapted: adapted(), original: original() } });
    expect(planPrepearImport(twice, []).items).toHaveLength(1);
  });
});
