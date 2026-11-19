// Where the app's data comes from. On the live site: the API (netlify/functions), signed in with Netlify Identity.
// Running locally (the UI checks, `npm run dev`): a demo backend in memory, starting from the sample recipes, because
// sign-in only works on a Netlify deploy.

import { Settings, type Recipe } from '../lib/recipe';
import type { Cookbook } from '../lib/cookbook';
import { today, type Planned } from '../lib/planner';
import type { GroceryChange, GroceryItem } from '../lib/groceries';
import { nameOf, ruleThings, type GroceryName } from '../lib/grocery-names';
import { LinkReading, ReadRecipe, type ReadRequest } from '../lib/read-recipe';
import {
  demoCookbooks as demoCookbooksSeed, demoGroceries as demoGroceriesSeed, demoPlanned as demoPlannedSeed, demoRecipes as demoRecipesSeed, demoStores,
} from '../demo/data';
import { accessToken, currentUser, SignedOutError } from './identity';

export type Backend = {
  listRecipes: () => Promise<Recipe[]>;
  saveRecipe: (r: Recipe) => Promise<Recipe>;
  deleteRecipe: (id: string) => Promise<void>;
  getSettings: () => Promise<Settings>;
  saveSettings: (patch: Partial<Settings>) => Promise<Settings>;
  /** store a photo picked on the phone (a data URL) and return its address */
  uploadPhoto: (dataUrl: string) => Promise<string>;
  /** issue #14: copy a Prepear photo (its path in Prepear's storage) into the photo store and return its address */
  copyPrepearPhoto: (path: string) => Promise<string>;
  /** issue #14: keep the Prepear export file (its text), for the cookbooks and meal plan later */
  keepPrepearExport: (text: string) => Promise<void>;
  /** issue #25: the kept Prepear export file (its text), or null when none was kept */
  keptPrepearExport: () => Promise<string | null>;
  listCookbooks: () => Promise<Cookbook[]>;
  /** save a whole cookbook (its sections and recipe ids) */
  saveCookbook: (c: Cookbook) => Promise<Cookbook>;
  deleteCookbook: (id: string) => Promise<void>;
  /** issue #17: read the recipe in photos or screenshots (shrunk on the phone); nothing is stored */
  readRecipe: (images: ReadRequest['images']) => Promise<ReadRecipe>;
  /** issue #15: read the recipe on the page at a link (with the page's photo); nothing is stored */
  readLink: (url: string) => Promise<LinkReading>;
  /** issue #62: the Planner, every recipe planned for a day */
  listPlanned: () => Promise<Planned[]>;
  /** plan a recipe for a day, or move it to another day (the same id) */
  savePlanned: (p: Planned) => Promise<Planned>;
  deletePlanned: (id: string) => Promise<void>;
  /** issue #64: the grocery list */
  listGroceries: () => Promise<GroceryItem[]>;
  /** save some items (new or changed) and take some off, in one go */
  changeGroceries: (change: GroceryChange) => Promise<void>;
  /** issue #64: what each ingredient is on the grocery list, every name known so far */
  listGroceryNames: () => Promise<GroceryName[]>;
  /** these names (at most 60), the new ones named by Claude now; with why, when Claude couldn't be asked */
  nameGroceries: (names: string[]) => Promise<{ names: GroceryName[]; error?: string }>;
  /** name a whole library's ingredients in the background (on the server) */
  backfillGroceryNames: (names: string[]) => Promise<void>;
  /** a correction from the phone (Same as…, Rename…), which Claude never overwrites */
  correctGroceryName: (name: Omit<GroceryName, 'by'>) => Promise<GroceryName>;
};

/**
 * A refusal from the API, with its status (403 not an admin). `signedOut` is set only when Identity refused to renew
 * the sign-in: the one case that signs you out (#114). Anything else, a 401 included, is an error to try again.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public signedOut = false,
  ) {
    super(message);
  }
}

export const isDemo =
  import.meta.env.VITE_DEMO === '1' || ['localhost', '127.0.0.1'].includes(typeof location === 'undefined' ? '' : location.hostname);

// ── the API ──

/** The sign-in's access token (identity.ts), or null offline; a refused renewal is the one way to be signed out. */
async function bearer(force = false): Promise<string | null> {
  const signedOut = () => new ApiError(401, 'Your sign-in ran out. Sign in again.', true);
  // gone from the phone: a renewal elsewhere in the app was refused (gotrue-js then clears it)
  if (!currentUser()) throw signedOut();
  try {
    return await accessToken(force);
  } catch (e) {
    if (e instanceof SignedOutError) throw signedOut();
    throw e;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = (token: string | null) =>
    fetch(path, { ...init, headers: { ...(init.headers as Record<string, string>), ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  let token = await bearer();
  let res = await send(token);
  // a token Identity no longer accepts: renew it once and try again
  if (res.status === 401) res = await send((token = await bearer(true)));
  // no token to send: the renewal couldn't reach Identity (a bad connection), which isn't being signed out (#114)
  if (res.status === 401 && !token) throw new ApiError(503, 'Couldn’t renew your sign-in. Check your connection and try again.');
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `The server said ${res.status}.`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const outOfDate = () => new ApiError(502, 'The app is out of date. Update it in Settings → Version, then try again.');

type Reading = { status: 'reading' } | { status: 'done'; recipe: unknown } | { status: 'failed'; code: number; error: string };

/** Wait for a reading job (issues #17, #15): ask how it's doing every 2s until it's done (its answer) or failed. */
async function readingOf(id: unknown, what: 'photo' | 'page'): Promise<Record<string, unknown>> {
  if (typeof id !== 'string') throw outOfDate();
  const until = Date.now() + 6 * 60_000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    let s: Reading;
    try {
      s = await call<Reading>(`/api/read-recipe/${encodeURIComponent(id)}`);
    } catch (e) {
      // a lost answer on a bad connection: ask again; a refusal or a lost reading ends it
      if (e instanceof ApiError && [401, 403, 404].includes(e.status)) throw e;
      if (Date.now() > until) throw e;
      continue;
    }
    if (s.status === 'done') return s;
    if (s.status === 'failed') throw new ApiError(s.code, s.error);
    if (Date.now() > until) throw new ApiError(504, `Reading the ${what} took too long. Try again.`);
  }
}

const http: Backend = {
  listRecipes: () => call<Recipe[]>('/api/recipes'),
  saveRecipe: (r) => call<Recipe>(`/api/recipes/${encodeURIComponent(r.id)}`, jsonInit('PUT', r)),
  deleteRecipe: (id) => call<void>(`/api/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getSettings: () => call<Settings>('/api/settings'),
  saveSettings: (patch) => call<Settings>('/api/settings', jsonInit('PATCH', patch)),
  uploadPhoto: async (dataUrl) => {
    const blob = await (await fetch(dataUrl)).blob();
    const { url } = await call<{ url: string }>('/api/photos', { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
    return url;
  },
  copyPrepearPhoto: async (path) => (await call<{ url: string }>('/api/photos', jsonInit('POST', { prepear: path }))).url,
  keepPrepearExport: async (text) => {
    await call('/api/imports/prepear', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: text });
  },
  keptPrepearExport: async () => {
    try {
      return JSON.stringify(await call<unknown>('/api/imports/prepear'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  listCookbooks: () => call<Cookbook[]>('/api/cookbooks'),
  saveCookbook: (c) => call<Cookbook>(`/api/cookbooks/${encodeURIComponent(c.id)}`, jsonInit('PUT', c)),
  deleteCookbook: (id) => call<void>(`/api/cookbooks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listPlanned: () => call<Planned[]>('/api/planner'),
  savePlanned: (p) => call<Planned>(`/api/planner/${encodeURIComponent(p.id)}`, jsonInit('PUT', p)),
  deletePlanned: (id) => call<void>(`/api/planner/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listGroceries: () => call<GroceryItem[]>('/api/groceries'),
  changeGroceries: (change) => call<void>('/api/groceries', jsonInit('POST', change)),
  listGroceryNames: () => call<GroceryName[]>('/api/grocery-names'),
  nameGroceries: (names) => call<{ names: GroceryName[]; error?: string }>('/api/grocery-names', jsonInit('POST', { names })),
  backfillGroceryNames: async (names) => {
    await call<unknown>('/api/grocery-names', jsonInit('POST', { backfill: names }));
  },
  correctGroceryName: (name) => call<GroceryName>('/api/grocery-names', jsonInit('PUT', name)),
  // the reading runs in a background function (it can take longer than an ordinary call may); ask for it every 2s
  readRecipe: async (images) => {
    const { id } = await call<{ id?: unknown }>('/api/read-recipe', jsonInit('POST', { images }));
    const read = ReadRecipe.safeParse((await readingOf(id, 'photo')).recipe);
    if (read.success) return read.data;
    // the app on the phone and the server don't agree on the answer: one of them is a newer version
    throw outOfDate();
  },
  // a recipe site's page is read at once; any other page is read by Claude like the photos
  readLink: async (url) => {
    const started = await call<{ status?: unknown; id?: unknown }>('/api/read-recipe', jsonInit('POST', { url }));
    const read = LinkReading.safeParse(started.status === 'done' ? started : await readingOf(started.id, 'page'));
    if (read.success) return read.data;
    throw outOfDate();
  },
};

// ── the demo backend ──

const demoReading = (first: { width: number; height: number }): ReadRecipe => ({
  found: true,
  title: 'Lemon Drizzle Loaf',
  source: '@sample.kitchen',
  servings: 8,
  servingSize: '1 slice',
  prepMinutes: 15,
  cookMinutes: 50,
  ingredients: [
    { group: '', lines: ['225 g unsalted butter, softened', '225 g caster sugar', '4 eggs', '225 g self-raising flour', 'Zest of 1 lemon'] },
    { group: 'For the drizzle', lines: ['Juice of 1½ lemons', '85 g caster sugar'] },
  ],
  directions: [
    { group: '', steps: ['Heat the oven to 180C (160C fan) and line a 2 lb loaf tin.', 'Beat the butter and sugar until pale, then beat in the eggs one at a time.', 'Fold in the flour and lemon zest, spoon into the tin and bake for 45–50 minutes.'] },
    { group: 'Drizzle', steps: ['Mix the lemon juice and sugar, prick the warm cake all over and pour it on.'] },
  ],
  notes: 'Keeps for 3 days in a tin.',
  dishPhoto: { image: 0, left: 0, top: 0, width: first.width, height: Math.round(first.height * 0.45) },
});

const demoLinkReading: ReadRecipe = {
  found: true,
  title: 'Weeknight Chickpea Curry',
  source: 'Sample Kitchen',
  servings: 4,
  servingSize: '',
  prepMinutes: 10,
  cookMinutes: 25,
  ingredients: [{ group: '', lines: ['2 tbsp olive oil', '1 onion, finely chopped', '3 garlic cloves, crushed', '2 tbsp curry paste', '2 × 400 g cans chickpeas, drained', '400 ml coconut milk', 'Handful of spinach'] }],
  directions: [{ group: '', steps: ['Soften the onion in the oil for 8 minutes, then add the garlic and curry paste for 1 minute.', 'Add the chickpeas and coconut milk and simmer for 15 minutes.', 'Stir in the spinach until it wilts. Serve with rice.'] }],
  notes: '',
  dishPhoto: null,
};

const DEMO_SETTINGS = 'cookbook.demoSettings';
// the demo shops at two made-up stores (issue #64), so the grocery list's store choices show without setting them up
const DEMO_DEFAULTS = { groceryStores: demoStores, groceryStore: demoStores[0].slug };
const readDemoSettings = (): Settings => {
  try {
    return Settings.parse({ ...DEMO_DEFAULTS, ...JSON.parse(localStorage.getItem(DEMO_SETTINGS) ?? '{}') });
  } catch {
    return Settings.parse(DEMO_DEFAULTS);
  }
};

let demoRecipes: Recipe[] = demoRecipesSeed();
let demoCookbooks: Cookbook[] = demoCookbooksSeed();
let demoPlanned: Planned[] = demoPlannedSeed(today());
let demoGroceries: GroceryItem[] = demoGroceriesSeed(demoRecipes);
// the demo names ingredients by the general rules where the site asks Claude (issue #64)
const demoNames = new Map<string, GroceryName>();
const demoName = (name: string): GroceryName => demoNames.get(nameOf(name)) ?? { key: nameOf(name), things: ruleThings(name), by: 'claude' };
// the Prepear export kept by an import on this page (locally: the sample file, until the page reloads)
let demoKeptExport: string | null = null;
const demoKnown = (ids: string[]) => [...new Set(ids)].filter((i) => demoRecipes.some((r) => r.id === i));

const demo: Backend = {
  listRecipes: async () => structuredClone(demoRecipes),
  saveRecipe: async (r) => {
    const saved = { ...r, updatedAt: new Date().toISOString() };
    demoRecipes = demoRecipes.some((x) => x.id === r.id) ? demoRecipes.map((x) => (x.id === r.id ? saved : x)) : [saved, ...demoRecipes];
    return structuredClone(saved);
  },
  deleteRecipe: async (id) => {
    demoRecipes = demoRecipes.filter((x) => x.id !== id);
    // as the database does: the recipe leaves every cookbook
    const out = (ids: string[]) => ids.filter((i) => i !== id);
    const cover = (c?: string | null) => (c === id ? null : c);
    demoCookbooks = demoCookbooks.map((c) => ({
      ...c,
      coverRecipeId: cover(c.coverRecipeId),
      recipeIds: out(c.recipeIds),
      sections: c.sections.map((s) => ({ ...s, coverRecipeId: cover(s.coverRecipeId), recipeIds: out(s.recipeIds) })),
    }));
    // and every day it was planned for, and the grocery list
    demoPlanned = demoPlanned.filter((p) => p.recipeId !== id);
    demoGroceries = demoGroceries.filter((g) => g.recipeId !== id);
  },
  getSettings: async () => readDemoSettings(),
  saveSettings: async (patch) => {
    const next = { ...readDemoSettings(), ...patch };
    try {
      localStorage.setItem(DEMO_SETTINGS, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
    return next;
  },
  // nothing to upload to: the photo stays a data URL
  uploadPhoto: async (dataUrl) => dataUrl,
  // locally there's no photo store or Prepear: imported recipes show the grey placeholder
  copyPrepearPhoto: async () => '',
  keepPrepearExport: async (text) => {
    demoKeptExport = text;
  },
  keptPrepearExport: async () => demoKeptExport,
  listCookbooks: async () => structuredClone(demoCookbooks).sort((a, b) => a.name.localeCompare(b.name)),
  saveCookbook: async (c) => {
    if (c.prepearId && demoCookbooks.some((x) => x.prepearId === c.prepearId && x.id !== c.id)) throw new ApiError(409, 'That Prepear cookbook is already here.');
    const before = demoCookbooks.find((x) => x.id === c.id);
    const saved: Cookbook = {
      ...c,
      prepearId: c.prepearId ?? before?.prepearId,
      recipeIds: demoKnown(c.recipeIds),
      sections: c.sections.map((s) => ({ ...s, recipeIds: demoKnown(s.recipeIds) })),
      updatedAt: new Date().toISOString(),
    };
    if (!saved.prepearId) delete saved.prepearId;
    demoCookbooks = before ? demoCookbooks.map((x) => (x.id === c.id ? saved : x)) : [...demoCookbooks, saved];
    return structuredClone(saved);
  },
  deleteCookbook: async (id) => {
    demoCookbooks = demoCookbooks.filter((x) => x.id !== id);
  },
  // no Claude locally: after a moment, the same made-up recipe for any photo, its dish photo the top of the first image.
  // `?readfail` makes it fail instead, for the UI check.
  readRecipe: async (images) => {
    await new Promise((r) => setTimeout(r, 1500));
    if (new URLSearchParams(location.search).has('readfail')) throw new ApiError(502, 'Claude is busy right now. Try again in a moment.');
    return demoReading(images[0]);
  },
  // no web access locally: after a moment, a made-up recipe for any link, with one of the sample photos.
  // `?readfail` makes it fail instead, for the UI check.
  readLink: async (url) => {
    await new Promise((r) => setTimeout(r, 1500));
    if (new URLSearchParams(location.search).has('readfail')) {
      throw new ApiError(502, 'example.com wouldn’t let the app read the page. Take screenshots of the recipe and use From photos or screenshots instead.');
    }
    const blob = await (await fetch('/photos/meatballs.jpg')).blob().catch(() => null);
    const photo = blob?.type.startsWith('image/')
      ? await new Promise<string>((done) => {
          const reader = new FileReader();
          reader.onload = () => done(String(reader.result));
          reader.readAsDataURL(blob);
        })
      : undefined;
    return { url, recipe: demoLinkReading, ...(photo ? { photo } : {}) };
  },
  listPlanned: async () => structuredClone(demoPlanned),
  savePlanned: async (p) => {
    if (p.recipeId && !demoRecipes.some((r) => r.id === p.recipeId)) throw new ApiError(409, 'That recipe was deleted.');
    demoPlanned = demoPlanned.some((x) => x.id === p.id) ? demoPlanned.map((x) => (x.id === p.id ? p : x)) : [...demoPlanned, p];
    return structuredClone(p);
  },
  deletePlanned: async (id) => {
    demoPlanned = demoPlanned.filter((x) => x.id !== id);
  },
  listGroceries: async () => structuredClone(demoGroceries).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
  changeGroceries: async ({ save = [], remove = [] }) => {
    const known = save.filter((g) => !g.recipeId || demoRecipes.some((r) => r.id === g.recipeId));
    demoGroceries = demoGroceries.filter((g) => !remove.includes(g.id));
    for (const g of known) demoGroceries = demoGroceries.some((x) => x.id === g.id) ? demoGroceries.map((x) => (x.id === g.id ? g : x)) : [...demoGroceries, g];
  },
  listGroceryNames: async () => [...demoNames.values()],
  nameGroceries: async (names) => {
    await new Promise((r) => setTimeout(r, 150));
    const named = names.filter((n) => nameOf(n)).map((n) => demoName(n));
    for (const n of named) demoNames.set(n.key, n);
    return { names: named };
  },
  backfillGroceryNames: async (names) => {
    for (const n of names) if (nameOf(n)) demoNames.set(nameOf(n), demoName(n));
  },
  correctGroceryName: async (name) => {
    const kept: GroceryName = { ...name, by: 'you' };
    demoNames.set(kept.key, kept);
    return kept;
  },
};

/**
 * `?slow` (the demo only, for the UI check): calls take as long as on the network, reads 0.3s and saves 1.2s (a save
 * writes in a transaction), so a list can be reloaded and come back while a save is still on its way (issue #25: a
 * cookbook just made vanished that way). The store also treats data as stale at once with it, as it is on the phone
 * after a minute.
 */
export const demoSlow = isDemo && typeof location !== 'undefined' && new URLSearchParams(location.search).has('slow');
const slowly = (b: Backend): Backend =>
  Object.fromEntries(
    Object.entries(b).map(([name, call]) => [name, async (...args: unknown[]) => {
      await new Promise((r) => setTimeout(r, /^(list|get|kept)/.test(name) ? 300 : 1200));
      return (call as (...a: unknown[]) => unknown)(...args);
    }]),
  ) as Backend;

/**
 * `?loading` (the demo only, for the UI check, issue #35): the recipes, cookbooks and Planner never arrive, so the screens stay in
 * their loading state (the grey placeholders) long enough to look at.
 */
const demoLoading = isDemo && typeof location !== 'undefined' && new URLSearchParams(location.search).has('loading');
const neverLoading = (b: Backend): Backend => ({
  ...b,
  listRecipes: () => new Promise(() => {}),
  listCookbooks: () => new Promise(() => {}),
  listPlanned: () => new Promise(() => {}),
  listGroceries: () => new Promise(() => {}),
  listGroceryNames: () => new Promise(() => {}),
});

export const backend: Backend = isDemo ? (demoLoading ? neverLoading(demo) : demoSlow ? slowly(demo) : demo) : http;
