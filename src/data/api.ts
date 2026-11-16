// Where the app's data comes from. On the live site: the API (netlify/functions), signed in with Netlify Identity.
// Running locally (the UI checks, `npm run dev`): a demo backend in memory, starting from the sample recipes, because
// sign-in only works on a Netlify deploy.

import { Settings, type Recipe } from '../lib/recipe';
import { demoRecipes as demoRecipesSeed } from '../demo/data';
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

const demo: Backend = {
  listRecipes: async () => structuredClone(demoRecipes),
  saveRecipe: async (r) => {
    const saved = { ...r, updatedAt: new Date().toISOString() };
    demoRecipes = demoRecipes.some((x) => x.id === r.id) ? demoRecipes.map((x) => (x.id === r.id ? saved : x)) : [saved, ...demoRecipes];
    return structuredClone(saved);
  },
  deleteRecipe: async (id) => {
    demoRecipes = demoRecipes.filter((x) => x.id !== id);
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
  keepPrepearExport: async () => undefined,
};

export const backend: Backend = isDemo ? demo : http;
