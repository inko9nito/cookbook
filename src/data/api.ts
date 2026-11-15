// Where the app's data comes from. On the live site: the API (netlify/functions), signed in with Netlify Identity.
// Running locally (the UI checks, `npm run dev`): a demo backend in memory, starting from the sample recipes, because
// sign-in only works on a Netlify deploy.

import { refreshSession } from '@netlify/identity';
import { Settings, type Recipe } from '../lib/recipe';
import { sampleRecipes } from '../demo/data';

export type Backend = {
  listRecipes: () => Promise<Recipe[]>;
  saveRecipe: (r: Recipe) => Promise<Recipe>;
  deleteRecipe: (id: string) => Promise<void>;
  getSettings: () => Promise<Settings>;
  saveSettings: (patch: Partial<Settings>) => Promise<Settings>;
  /** store a photo picked on the phone (a data URL) and return its address */
  uploadPhoto: (dataUrl: string) => Promise<string>;
};

/** A refusal from the API, with its status (401 signed out, 403 not the owner, 503 no owner set). */
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

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  // the sign-in token lasts an hour: renew it first when it's about to run out (a no-op otherwise)
  await refreshSession().catch(() => null);
  const send = () => fetch(path, { ...init, credentials: 'same-origin' });
  let res = await send();
  if (res.status === 401 && (await refreshSession().catch(() => null))) res = await send();
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

let demoRecipes: Recipe[] = structuredClone(sampleRecipes);

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
};

export const backend: Backend = isDemo ? demo : http;
