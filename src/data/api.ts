// Where the app's data comes from. On the live site: the API (netlify/functions), signed in with Netlify Identity.
// Running locally (the UI checks, `npm run dev`): a demo backend in memory, starting from the sample recipes, because
// sign-in only works on a Netlify deploy.

import { Settings, type Recipe } from '../lib/recipe';
import type { Cookbook } from '../lib/cookbook';
import { demoCookbooks as demoCookbooksSeed, demoRecipes as demoRecipesSeed } from '../demo/data';
import { accessToken, SignedOutError } from './identity';

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
};

/** A refusal from the API, with its status (401 signed out, 403 not an admin). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const isDemo =
  import.meta.env.VITE_DEMO === '1' || ['localhost', '127.0.0.1'].includes(typeof location === 'undefined' ? '' : location.hostname);

// ── the API ──

/** The sign-in as a request header (identity.ts); a refused renewal reads as signed out (401). */
async function authHeader(force = false): Promise<Record<string, string>> {
  try {
    const token = await accessToken(force);
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch (e) {
    if (e instanceof SignedOutError) throw new ApiError(401, 'Your sign-in ran out. Sign in again.');
    throw e;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = async (force = false) =>
    fetch(path, { ...init, headers: { ...(init.headers as Record<string, string>), ...(await authHeader(force)) } });
  let res = await send();
  // a token Identity no longer accepts: renew it once and try again
  if (res.status === 401) res = await send(true);
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
};

// ── the demo backend ──

const DEMO_SETTINGS = 'cookbook.demoSettings';
const readDemoSettings = (): Settings => {
  try {
    return Settings.parse(JSON.parse(localStorage.getItem(DEMO_SETTINGS) ?? '{}'));
  } catch {
    return Settings.parse({});
  }
};

let demoRecipes: Recipe[] = demoRecipesSeed();
let demoCookbooks: Cookbook[] = demoCookbooksSeed();
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
 * `?loading` (the demo only, for the UI check, issue #35): the recipes and cookbooks never arrive, so the screens stay in
 * their loading state (the grey placeholders) long enough to look at.
 */
const demoLoading = isDemo && typeof location !== 'undefined' && new URLSearchParams(location.search).has('loading');
const neverLoading = (b: Backend): Backend => ({ ...b, listRecipes: () => new Promise(() => {}), listCookbooks: () => new Promise(() => {}) });

export const backend: Backend = isDemo ? (demoLoading ? neverLoading(demo) : demoSlow ? slowly(demo) : demo) : http;
