import { describe, expect, test } from 'vitest';
import { ReadRecipe, dishCrop, linkIn, readToRecipe, sameLink, withReading } from './read-recipe';
import { emptyRecipe } from './recipe';

// A made-up reading, in the shape the server returns.
const reading = (over: Partial<ReadRecipe> = {}): ReadRecipe => ({
  found: true,
  title: 'Lemon Drizzle Cake',
  source: '@someone',
  servings: 8,
  servingSize: '1 slice',
  prepMinutes: 15,
  cookMinutes: 45,
  ingredients: [
    { group: '', lines: ['225 g butter, softened', '  ', '1½ cups sugar'] },
    { group: 'For the drizzle:', lines: ['Juice of 1½ lemons', '85 g caster sugar'] },
    { group: 'Empty group', lines: [] },
  ],
  directions: [
    { group: '', steps: ['1. Heat the oven to 180C.', 'Step 2', 'Beat the butter and sugar.'] },
    { group: 'Drizzle', steps: ['Mix the lemon juice and sugar.'] },
  ],
  notes: 'Keeps for 3 days.',
  dishPhoto: null,
  ...over,
});

describe('readToRecipe', () => {
  test('ingredient lines keep their raw text and are parsed like a paste; groups become headers', () => {
    const r = readToRecipe(reading());
    expect(r.ingredients.map((i) => [i.kind ?? '', i.raw ?? '', i.name])).toEqual([
      ['', '225 g butter, softened', expect.stringContaining('butter')],
      ['', '1½ cups sugar', expect.stringContaining('sugar')],
      ['header', '', 'For the drizzle'],
      ['', 'Juice of 1½ lemons', expect.any(String)],
      ['', '85 g caster sugar', expect.stringContaining('sugar')],
    ]);
    expect(r.ingredients[0].amount).toBe('225');
  });

  test('steps lose their numbers, bare "Step 2" labels are dropped, groups become headers', () => {
    expect(readToRecipe(reading()).steps.map((s) => [s.kind ?? '', s.text])).toEqual([
      ['', 'Heat the oven to 180C.'],
      ['', 'Beat the butter and sugar.'],
      ['header', 'Drizzle'],
      ['', 'Mix the lemon juice and sugar.'],
    ]);
  });

  test('times and servings: missing or nonsense become 0 / null', () => {
    const r = readToRecipe(reading({ servings: null, prepMinutes: null, cookMinutes: -5 }));
    expect([r.servings, r.prepMinutes, r.cookMinutes]).toEqual([null, 0, 0]);
    expect(readToRecipe(reading({ prepMinutes: 12.6 })).prepMinutes).toBe(13);
  });

  test('a line named like one of the recipes links to it (issue #11)', () => {
    const crust = { ...emptyRecipe(), title: 'Pie Crust' };
    const r = readToRecipe(reading({ ingredients: [{ group: '', lines: ['1 pie crust'] }] }), [crust]);
    expect(r.ingredients[0].recipeId).toBe(crust.id);
  });
});

describe('withReading', () => {
  test('fills an empty new recipe', () => {
    const r = withReading(emptyRecipe(), reading());
    expect(r.title).toBe('Lemon Drizzle Cake');
    expect(r.servings).toBe(8);
    expect(r.ingredients).toHaveLength(5);
    expect(r.notes).toBe('Keeps for 3 days.');
  });

  test('keeps what was typed while reading and adds after it', () => {
    const draft = { ...emptyRecipe(), title: 'Gran’s cake', notes: 'From Gran.', prepMinutes: 5, ingredients: [{ id: 'x', amount: '', unit: '', name: 'love', note: '' }] };
    const r = withReading(draft, reading());
    expect(r.title).toBe('Gran’s cake');
    expect(r.prepMinutes).toBe(5);
    expect(r.cookMinutes).toBe(45);
    expect(r.ingredients[0].id).toBe('x');
    expect(r.notes).toBe('From Gran.\n\nKeeps for 3 days.');
  });

  test('the schema accepts a reading with no recipe', () => {
    expect(ReadRecipe.parse(reading({ found: false, title: '', ingredients: [], directions: [], servings: null })).found).toBe(false);
  });
});

describe('dishCrop', () => {
  test('a wide photo at the top of a screenshot: as wide as the photo, 4:3, scaled to the kept size', () => {
    // sent 720 wide; kept 1440 × 3120
    expect(dishCrop({ image: 0, left: 0, top: 100, width: 720, height: 400 }, 720, 1440, 3120)).toEqual({ x: 0, y: 60, width: 1440, height: 1080 });
  });

  test('a tall photo: as tall as the photo, centred on it, kept inside the image', () => {
    const box = dishCrop({ image: 0, left: 10, top: 0, width: 300, height: 400 }, 1000, 1000, 750)!;
    expect(box.height).toBe(400);
    expect(box.width).toBe(533);
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
  });

  test('larger than the image: the largest 4:3 box that fits', () => {
    expect(dishCrop({ image: 0, left: -20, top: -20, width: 2000, height: 2000 }, 1000, 1000, 1000)).toEqual({ x: 0, y: 125, width: 1000, height: 750 });
  });

  test('a tiny box is no photo', () => {
    expect(dishCrop({ image: 0, left: 10, top: 10, width: 20, height: 20 }, 1000, 1000, 1000)).toBeNull();
  });
});

describe('links (issue #15)', () => {
  test('the link in what was pasted', () => {
    expect(linkIn('https://example.com/pie/')).toBe('https://example.com/pie/');
    expect(linkIn('  Look at this! https://www.example.com/pie?x=1. So good')).toBe('https://www.example.com/pie?x=1');
    expect(linkIn('(https://example.com/a)')).toBe('https://example.com/a');
    expect(linkIn('example.com/pie')).toBe('https://example.com/pie');
    expect(linkIn('www.example.co.uk')).toBe('https://www.example.co.uk');
    expect(linkIn('chicken pie')).toBeNull();
    expect(linkIn('')).toBeNull();
  });

  test('the same page, whatever the scheme, www, tracking bits or trailing slash', () => {
    expect(sameLink('https://www.example.com/pie/', 'http://example.com/pie?utm_source=ig#top')).toBe(true);
    expect(sameLink('https://example.com/pie?id=2', 'https://example.com/pie?id=3')).toBe(false);
    expect(sameLink('https://example.com/pie', 'https://example.com/tart')).toBe(false);
  });
});
