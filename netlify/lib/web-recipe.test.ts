import { describe, expect, test } from 'vitest';
import {
  cleanText, decodeEntities, fetchPage, fetchPhoto, findRecipe, htmlToText, instructionGroups, isoMinutes, isPublicUrl,
  readPage, recipeImage, recipeToReading, yieldServings,
} from './web-recipe';
import { readLink } from './read-recipe';

// Made-up pages in the shapes recipe sites use (WordPress recipe plugins put the recipe in an @graph; others give it
// alone or in a list).
const recipeLd = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Lemon &amp; Herb Chicken',
  recipeYield: ['4', '4 servings'],
  prepTime: 'PT15M',
  cookTime: 'PT1H5M',
  totalTime: 'PT1H20M',
  image: [
    'https://example.com/wp-content/uploads/chicken-1200x1200.jpg',
    'https://example.com/wp-content/uploads/chicken-1200x900.jpg',
    'https://example.com/wp-content/uploads/chicken-1200x675.jpg',
  ],
  recipeIngredient: ['1 &frac12; lb chicken thighs', '2 tbsp olive oil', 'Zest of 1 lemon', '  '],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Heat the oven to 200&deg;C.' },
    {
      '@type': 'HowToSection',
      name: 'For the sauce',
      itemListElement: [{ '@type': 'HowToStep', text: 'Whisk the oil and zest.' }, { '@type': 'HowToStep', text: 'Pour it over.' }],
    },
  ],
  nutrition: { '@type': 'NutritionInformation', servingSize: '1 thigh' },
};
const page = (ld: unknown, extra = '') => `<!doctype html><html><head><title>Lemon Chicken | Example Kitchen</title>
<meta property="og:site_name" content="Example Kitchen"><meta property="og:image" content="/og.jpg">
<script type="application/ld+json">${JSON.stringify(ld)}</script>${extra}</head><body><h1>Lemon Chicken</h1></body></html>`;

describe('text', () => {
  test('entities are decoded, also when encoded twice', () => {
    expect(decodeEntities('1 &frac12; cups &amp; 2&#8217;s &#x2013; &nbsp;x')).toBe('1 ½ cups & 2’s –  x');
    expect(decodeEntities('&amp;frac34; cup')).toBe('¾ cup');
    expect(decodeEntities('&unknown; stays')).toBe('&unknown; stays');
  });

  test('cleanText drops tags and collapses spaces', () => {
    expect(cleanText('<p>Mix <b>well</b>,<br>then\n rest.</p>')).toBe('Mix well , then rest.');
    expect(cleanText(undefined)).toBe('');
    expect(cleanText(4)).toBe('4');
  });

  test('htmlToText keeps blocks as lines and drops scripts, styles and navigation', () => {
    const html = '<nav>Home</nav><h2>Ingredients</h2><ul><li>2 eggs</li><li>1 cup milk</li></ul><script>var x=1</script><p>Whisk.</p><footer>©</footer>';
    expect(htmlToText(html)).toBe('Ingredients\n• 2 eggs\n• 1 cup milk\nWhisk.');
  });
});

describe('schema.org Recipe', () => {
  test('found alone, in a list, in an @graph, or as a page’s mainEntity', () => {
    expect(findRecipe(page(recipeLd))?.name).toBe(recipeLd.name);
    expect(findRecipe(page([{ '@type': 'WebSite' }, recipeLd]))?.name).toBe(recipeLd.name);
    expect(findRecipe(page({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Article' }, { ...recipeLd, '@type': ['Recipe', 'NewsArticle'] }] }))?.name).toBe(recipeLd.name);
    expect(findRecipe(page({ '@type': 'WebPage', mainEntity: recipeLd }))?.name).toBe(recipeLd.name);
    expect(findRecipe(page({ '@type': 'Article' }))).toBeNull();
  });

  test('a block that isn’t valid JSON is skipped; raw line breaks inside strings are forgiven', () => {
    const html = `<script type="application/ld+json">{ nope </script><script type="application/ld+json">{"@type":"Recipe","name":"Two\nlines"}</script>`;
    expect(findRecipe(html)?.name).toBe('Two lines');
  });

  test('durations, yields', () => {
    expect(isoMinutes('PT1H15M')).toBe(75);
    expect(isoMinutes('P0DT0H45M')).toBe(45);
    expect(isoMinutes('PT90S')).toBe(2);
    expect(isoMinutes('P1D')).toBe(1440);
    expect(isoMinutes('20')).toBe(20);
    expect(isoMinutes('20 minutes')).toBe(0);
    expect(yieldServings(['4', '4 servings'])).toBe(4);
    expect(yieldServings('Serves 4-6')).toBe(4);
    expect(yieldServings('Makes 12 cookies')).toBe(12);
    expect(yieldServings(6)).toBe(6);
    expect(yieldServings('a loaf')).toBeNull();
  });

  test('instructions: one text, texts, steps and sections', () => {
    expect(instructionGroups('<p>1. Mix.</p><p>2. Bake.</p>')).toEqual([{ group: '', steps: ['1. Mix.', '2. Bake.'] }]);
    expect(instructionGroups('Mix.\nBake.')).toEqual([{ group: '', steps: ['Mix.', 'Bake.'] }]);
    expect(instructionGroups(['Mix.', 'Bake.'])).toEqual([{ group: '', steps: ['Mix.', 'Bake.'] }]);
    expect(instructionGroups(recipeLd.recipeInstructions)).toEqual([
      { group: '', steps: ['Heat the oven to 200°C.'] },
      { group: 'For the sauce', steps: ['Whisk the oil and zest.', 'Pour it over.'] },
    ]);
    expect(instructionGroups([{ '@type': 'HowToStep', name: 'Only a name' }])).toEqual([{ group: '', steps: ['Only a name'] }]);
  });

  test('the photo closest to 4:3 of those listed; else the first', () => {
    expect(recipeImage(recipeLd.image, 'https://example.com/')).toBe('https://example.com/wp-content/uploads/chicken-1200x900.jpg');
    expect(recipeImage({ '@type': 'ImageObject', url: '/a.jpg', width: 800, height: 800 }, 'https://example.com/r/')).toBe('https://example.com/a.jpg');
    expect(recipeImage(['https://x.com/a.jpg', 'https://x.com/b.jpg'], 'https://x.com/')).toBe('https://x.com/a.jpg');
    expect(recipeImage(['javascript:alert(1)'], 'https://x.com/')).toBe('');
    expect(recipeImage(undefined, 'https://x.com/')).toBe('');
  });

  test('a recipe as a reading: lines as written, prep and cook, servings, serving size', () => {
    expect(recipeToReading(recipeLd, 'Example Kitchen')).toEqual({
      found: true,
      title: 'Lemon & Herb Chicken',
      source: 'Example Kitchen',
      servings: 4,
      servingSize: '1 thigh',
      prepMinutes: 15,
      cookMinutes: 65,
      ingredients: [{ group: '', lines: ['1 ½ lb chicken thighs', '2 tbsp olive oil', 'Zest of 1 lemon'] }],
      directions: instructionGroups(recipeLd.recipeInstructions),
      notes: '',
      dishPhoto: null,
    });
  });

  test('only a total time: the rest after prep is cooking; "1 serving" isn’t a serving size', () => {
    const r = recipeToReading({ name: 'X', prepTime: 'PT10M', totalTime: 'PT40M', nutrition: { servingSize: '1 serving' } }, 's');
    expect([r.prepMinutes, r.cookMinutes, r.servingSize]).toEqual([10, 30, '']);
    expect(recipeToReading({ name: 'X', totalTime: 'PT40M' }, 's').cookMinutes).toBe(40);
  });
});

describe('readPage', () => {
  test('a recipe site: the recipe, its site’s name, and its photo', () => {
    const read = readPage(page(recipeLd), 'https://www.example.com/lemon-chicken/');
    expect(read.kind).toBe('recipe');
    if (read.kind !== 'recipe') return;
    expect(read.recipe.source).toBe('Example Kitchen');
    expect(read.photoUrl).toBe('https://example.com/wp-content/uploads/chicken-1200x900.jpg');
  });

  test('a page without one (or one without ingredients): its text, headed by its address, site, title and summary', () => {
    const html = `<html><head><title>Grandma’s Pie</title><meta name="description" content="A family favourite"><meta property="og:image" content="https://cdn.example.org/pie.jpg"></head>
<body><nav>Menu</nav><h1>Grandma’s Pie</h1><ul><li>2 cups flour</li></ul><p>Bake it.</p></body></html>`;
    const read = readPage(html, 'https://www.example.org/pie');
    expect(read).toEqual({
      kind: 'text',
      text: 'Address: https://www.example.org/pie\nSite: example.org\nTitle: Grandma’s Pie\nSummary: A family favourite\n\nGrandma’s Pie\n• 2 cups flour\nBake it.',
      photoUrl: 'https://cdn.example.org/pie.jpg',
    });
    expect(readPage(page({ '@type': 'Recipe', name: 'Empty' }), 'https://example.com/').kind).toBe('text');
  });
});

describe('fetching', () => {
  test('only public web addresses', () => {
    for (const ok of ['https://example.com/r', 'http://www.bbc.co.uk/food', 'https://8.8.8.8/x']) expect(isPublicUrl(ok)).toBe(true);
    for (const bad of [
      'ftp://example.com', 'file:///etc/passwd', 'http://localhost/', 'http://127.0.0.1/', 'http://10.0.0.1/', 'http://192.168.1.1/',
      'http://169.254.169.254/latest', 'http://172.20.0.1/', 'http://[::1]/', 'http://intranet/', 'http://printer.local/',
      'https://user:pw@example.com/', 'http://example.com:8080/', 'http://2130706433/', 'not a url',
    ]) {
      expect(isPublicUrl(bad), bad).toBe(false);
    }
  });

  /** A stand-in for the web: an answer per address. */
  const web = (pages: Record<string, () => Response>) => {
    const asked: string[] = [];
    const impl = (async (url: string | URL | Request) => {
      const u = String(url);
      asked.push(u);
      const answer = pages[u];
      if (!answer) throw new TypeError('fetch failed');
      return answer();
    }) as typeof fetch;
    return { impl, asked };
  };
  const html = (body: string, status = 200) => () => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

  test('a page, following redirects, which must stay on the public web', async () => {
    const { impl } = web({
      'https://example.com/a': () => new Response(null, { status: 301, headers: { location: '/b' } }),
      'https://example.com/b': html('<p>hi</p>'),
      'https://example.com/evil': () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    });
    expect(await fetchPage('https://example.com/a', impl)).toMatchObject({ html: '<p>hi</p>' });
    await expect(fetchPage('https://example.com/evil', impl)).rejects.toMatchObject({ status: 400 });
  });

  test('refusals become messages for the person', async () => {
    const { impl } = web({
      'https://blocked.com/': html('no', 403),
      'https://gone.com/': html('no', 404),
      'https://pdf.com/': () => new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }),
    });
    await expect(fetchPage('https://blocked.com/', impl)).rejects.toMatchObject({ status: 502, message: expect.stringContaining('blocked.com wouldn’t let the app read the page') });
    await expect(fetchPage('https://gone.com/', impl)).rejects.toMatchObject({ status: 404 });
    await expect(fetchPage('https://pdf.com/', impl)).rejects.toMatchObject({ status: 415 });
    await expect(fetchPage('https://nowhere.com/', impl)).rejects.toMatchObject({ status: 502, message: 'Couldn’t reach nowhere.com. Check the link.' });
  });

  test('a photo comes as a data URL; anything else (or nothing) is no photo', async () => {
    const { impl } = web({
      'https://example.com/p.jpg': () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }),
      'https://example.com/p.html': html('<p>not a photo</p>'),
    });
    expect(await fetchPhoto('https://example.com/p.jpg', 'https://example.com/', impl)).toBe('data:image/jpeg;base64,AQID');
    expect(await fetchPhoto('https://example.com/p.html', 'https://example.com/', impl)).toBeNull();
    expect(await fetchPhoto('https://example.com/missing.jpg', 'https://example.com/', impl)).toBeNull();
    expect(await fetchPhoto('', 'https://example.com/', impl)).toBeNull();
  });

  test('readLink: a recipe site is read at once, with its photo', async () => {
    const { impl } = web({
      'https://example.com/r': html(page(recipeLd)),
      'https://example.com/wp-content/uploads/chicken-1200x900.jpg': () => new Response(new Uint8Array([9]), { headers: { 'content-type': 'image/webp' } }),
    });
    const read = await readLink('https://example.com/r', impl);
    expect('done' in read && read.done).toMatchObject({ url: 'https://example.com/r', photo: 'data:image/webp;base64,CQ==', recipe: { title: 'Lemon & Herb Chicken' } });
  });

  test('readLink: another page is handed on as text for Claude; an empty one or a private address is refused', async () => {
    const long = '<p>' + 'Stir the pot. '.repeat(40) + '</p>';
    const { impl } = web({
      'https://blog.example.com/pie': html(`<title>Pie</title><body>${long}</body>`),
      'https://app.example.com/': html('<title>App</title><body><div id="root"></div></body>'),
      'https://guarded.com/r': html(`<title>Just a moment...</title><body>${long}</body>`),
    });
    const read = await readLink('https://blog.example.com/pie', impl);
    expect('page' in read && read.page.page.text).toContain('Stir the pot.');
    expect('page' in read && read.page.page.photo).toBeUndefined();
    await expect(readLink('https://app.example.com/', impl)).rejects.toMatchObject({ status: 422 });
    await expect(readLink('https://guarded.com/r', impl)).rejects.toMatchObject({ status: 502, message: expect.stringContaining('guarded.com wouldn’t let the app read the page') });
    await expect(readLink('http://localhost:8888/', impl)).rejects.toMatchObject({ status: 400 });
  });
});
