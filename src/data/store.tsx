// The app's recipes and settings, from the API (or the demo backend), through TanStack Query.
// Changes show at once (optimistic) and are sent in the background; if the server refuses, they're undone with a toast.
// On the live site the cache is kept in IndexedDB, so recipes open offline in the kitchen.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, set } from 'idb-keyval';
import { f7 } from 'framework7-react';
import { ApiError, backend, demoSlow, isDemo } from './api';
import { useAuth } from './auth';
import { Settings, type Recipe, type SortKey } from '../lib/recipe';
import type { Cookbook } from '../lib/cookbook';
import type { Planned } from '../lib/planner';
import type { GroceryItem } from '../lib/groceries';
import { isNamed, nameOf, namesMap, type GroceryName } from '../lib/grocery-names';
import { pendingChanges, upsert } from './pending';

const RECIPES = ['recipes'] as const;
const SETTINGS = ['settings'] as const;
const COOKBOOKS = ['cookbooks'] as const;
const PLANNER = ['planner'] as const;
const GROCERIES = ['groceries'] as const;
const GROCERY_NAMES = ['grocery-names'] as const;
const DAY = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { gcTime: 30 * DAY, staleTime: demoSlow ? 0 : 60 * 1000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 },
  },
});

const persister = createAsyncStoragePersister({
  storage: { getItem: (k) => get(k), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
  key: 'cookbook.cache',
});

/** Forget everything cached (on sign-out). */
export async function clearCache() {
  queryClient.clear();
  await persister.removeClient();
}

const toast = (text: string) => f7.toast?.show({ text, closeTimeout: 3000 });

// Saves and deletes on their way to the server (pending.ts): every list read from the server has them laid over it, so
// a reload that comes back first can't drop a recipe or cookbook just made, or undo a change. Saves go to the server
// one at a time, in order (a mutation scope), because each sends the whole recipe or cookbook: two quick changes
// arriving the wrong way round would keep the older one. On screen they still show at once.
const recipesUnderWay = pendingChanges<Recipe>();
const cookbooksUnderWay = pendingChanges<Cookbook>();
const plannedUnderWay = pendingChanges<Planned>();
const groceriesUnderWay = pendingChanges<GroceryItem>();
const fetchRecipes = async () => recipesUnderWay.overlay(await backend.listRecipes());
const fetchCookbooks = async () => cookbooksUnderWay.overlay(await backend.listCookbooks());
const fetchPlanned = async () => plannedUnderWay.overlay(await backend.listPlanned());
const fetchGroceries = async () => groceriesUnderWay.overlay(await backend.listGroceries());

/** Upload the photos picked on the phone (data URLs) and swap in their stored addresses. */
async function withUploadedPhotos(r: Recipe): Promise<Recipe> {
  const up = (u?: string) => (u?.startsWith('data:') ? backend.uploadPhoto(u) : Promise.resolve(u));
  const photos = await Promise.all(
    r.photos.map(async (p) => {
      const [src, original] = await Promise.all([up(p.src), up(p.original)]);
      return { ...p, src: src!, ...(original ? { original } : {}) };
    }),
  );
  return { ...r, photos };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  // the live site keeps its cache across launches; the demo starts fresh every time
  if (isDemo) return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 30 * DAY, buster: 'v1' }}>
      {children}
    </PersistQueryClientProvider>
  );
}

/**
 * Rendered once, in the app: when the API turns this account away (no admin role), or the sign-in has run
 * out, go back to the sign-in screen and forget the cached recipes.
 */
export function SessionGuard() {
  const auth = useAuth();
  const enabled = auth.status === 'signedIn';
  const recipesQuery = useQuery({ queryKey: RECIPES, queryFn: fetchRecipes, enabled });
  const settingsQuery = useQuery({ queryKey: SETTINGS, queryFn: backend.getSettings, enabled });
  const errors = [recipesQuery.error, settingsQuery.error];
  const refusal = errors.find((e) => e instanceof ApiError && e.status !== 401 && e.status < 500) as ApiError | undefined;
  const expired = errors.some((e) => e instanceof ApiError && e.status === 401);
  useEffect(() => {
    if (refusal) clearCache().then(() => auth.refuse(refusal.message));
    else if (expired) clearCache().then(() => auth.refuse('Your sign-in ran out. Sign in again.'));
  }, [refusal, expired]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function useStore() {
  const qc = useQueryClient();
  const enabled = useAuth().status === 'signedIn';

  const recipesQuery = useQuery({ queryKey: RECIPES, queryFn: fetchRecipes, enabled });
  const settingsQuery = useQuery({ queryKey: SETTINGS, queryFn: backend.getSettings, enabled });

  const save = useMutation({
    mutationFn: async (r: Recipe) => backend.saveRecipe(await withUploadedPhotos(r)),
    scope: { id: 'recipes' },
    onMutate: (r) => {
      recipesUnderWay.start(r.id, r);
      qc.setQueryData<Recipe[]>(RECIPES, (list = []) => (list.some((x) => x.id === r.id) ? upsert(list, r) : [r, ...list]));
    },
    // the server's copy (its stored photo addresses), unless a newer change to the recipe is still on its way
    onSuccess: (saved) => {
      if (recipesUnderWay.count(saved.id) === 1) qc.setQueryData<Recipe[]>(RECIPES, (list = []) => upsert(list, saved));
    },
    onError: (e) => toast(`Couldn’t save the recipe. ${e instanceof Error ? e.message : ''}`.trim()),
    // a refused save: the server's list is the truth again (with the other changes still under way laid over it)
    onSettled: (_saved, e, r) => {
      recipesUnderWay.end(r.id);
      if (e) qc.invalidateQueries({ queryKey: RECIPES });
    },
  });

  const remove = useMutation({
    mutationFn: backend.deleteRecipe,
    scope: { id: 'recipes' },
    onMutate: (id: string) => {
      recipesUnderWay.start(id, null);
      qc.setQueryData<Recipe[]>(RECIPES, (list = []) => list.filter((x) => x.id !== id));
    },
    onError: (e) => toast(`Couldn’t delete the recipe. ${e instanceof Error ? e.message : ''}`.trim()),
    onSettled: (_r, e, id) => {
      recipesUnderWay.end(id);
      if (e) qc.invalidateQueries({ queryKey: RECIPES });
      // the recipe also left every cookbook it was in, every day it was planned for and the grocery list (the database
      // does that)
      qc.invalidateQueries({ queryKey: COOKBOOKS });
      qc.invalidateQueries({ queryKey: PLANNER });
      qc.invalidateQueries({ queryKey: GROCERIES });
    },
  });

  const changeSettings = useMutation({
    mutationFn: backend.saveSettings,
    onMutate: async (patch: Partial<Settings>) => {
      await qc.cancelQueries({ queryKey: SETTINGS });
      const before = qc.getQueryData<Settings>(SETTINGS);
      qc.setQueryData<Settings>(SETTINGS, { ...(before ?? Settings.parse({})), ...patch });
      return { before };
    },
    onError: (_e, _p, ctx) => {
      qc.setQueryData(SETTINGS, ctx?.before);
      toast('Couldn’t save that setting.');
    },
  });

  const settings = settingsQuery.data ?? Settings.parse({});

  return {
    recipes: recipesQuery.data ?? [],
    /** the first load, with nothing cached yet */
    loading: recipesQuery.isPending && enabled,
    /** the recipes couldn't be loaded and there's nothing cached to show */
    loadError: !recipesQuery.data && recipesQuery.error instanceof Error ? recipesQuery.error.message : null,
    reload: () => recipesQuery.refetch(),
    saveRecipe: (r: Recipe) => save.mutate(r),
    deleteRecipe: (id: string) => remove.mutate(id),
    settings,
    sort: settings.sort,
    setSort: (sort: SortKey) => changeSettings.mutate({ sort }),
    setFilter: (filterTags: string[], filterMode = settings.filterMode) => changeSettings.mutate({ filterTags, filterMode }),
    setCookbookView: (cookbookView: Settings['cookbookView']) => changeSettings.mutate({ cookbookView }),
    /** issue #64: any of the grocery list's settings (stores, the store it's shopping at, its view, aisles picked) */
    changeSettings: (patch: Partial<Settings>) => changeSettings.mutate(patch),
  };
}

export type { SortKey };

/**
 * Cookbooks (issue #25): loaded like the recipes, kept offline too. Saving or deleting shows at once and is sent in the
 * background; if the server refuses, it's undone with a toast.
 */
export function useCookbooks() {
  const qc = useQueryClient();
  const enabled = useAuth().status === 'signedIn';
  const query = useQuery({ queryKey: COOKBOOKS, queryFn: fetchCookbooks, enabled });

  const save = useMutation({
    mutationFn: backend.saveCookbook,
    scope: { id: 'cookbooks' },
    onMutate: (c: Cookbook) => {
      cookbooksUnderWay.start(c.id, c);
      qc.setQueryData<Cookbook[]>(COOKBOOKS, (list = []) => upsert(list, c));
    },
    // the server's copy, unless a newer change to the cookbook is still on its way
    onSuccess: (saved) => {
      if (cookbooksUnderWay.count(saved.id) === 1) qc.setQueryData<Cookbook[]>(COOKBOOKS, (list = []) => upsert(list, saved));
    },
    onError: (e) => toast(`Couldn’t save the cookbook. ${e instanceof Error ? e.message : ''}`.trim()),
    onSettled: (_saved, e, c) => {
      cookbooksUnderWay.end(c.id);
      if (e) qc.invalidateQueries({ queryKey: COOKBOOKS });
    },
  });

  const remove = useMutation({
    mutationFn: backend.deleteCookbook,
    scope: { id: 'cookbooks' },
    onMutate: (id: string) => {
      cookbooksUnderWay.start(id, null);
      qc.setQueryData<Cookbook[]>(COOKBOOKS, (list = []) => list.filter((x) => x.id !== id));
    },
    onError: (e) => toast(`Couldn’t delete the cookbook. ${e instanceof Error ? e.message : ''}`.trim()),
    onSettled: (_r, e, id) => {
      cookbooksUnderWay.end(id);
      if (e) qc.invalidateQueries({ queryKey: COOKBOOKS });
    },
  });

  return {
    cookbooks: query.data ?? [],
    loading: query.isPending && enabled,
    loadError: !query.data && query.error instanceof Error ? query.error.message : null,
    reload: () => query.refetch(),
    saveCookbook: (c: Cookbook) => save.mutate(c),
    /** for the Prepear import: waits for the server, and throws if it refuses */
    saveCookbookNow: async (c: Cookbook) => {
      const saved = await backend.saveCookbook(c);
      qc.setQueryData<Cookbook[]>(COOKBOOKS, (list = []) => upsert(list, saved));
      return saved;
    },
    deleteCookbook: (id: string) => remove.mutate(id),
  };
}

/**
 * The Planner (issue #62): every recipe planned for a day, loaded like the recipes and kept offline too. Planning,
 * moving and taking one off show at once and are sent in the background; if the server refuses, it's undone with a toast.
 */
export function usePlanner() {
  const qc = useQueryClient();
  const enabled = useAuth().status === 'signedIn';
  const query = useQuery({ queryKey: PLANNER, queryFn: fetchPlanned, enabled });

  const save = useMutation({
    mutationFn: backend.savePlanned,
    scope: { id: 'planner' },
    onMutate: (p: Planned) => {
      plannedUnderWay.start(p.id, p);
      qc.setQueryData<Planned[]>(PLANNER, (list = []) => upsert(list, p));
    },
    onError: (e) => toast(`Couldn’t save that to the Planner. ${e instanceof Error ? e.message : ''}`.trim()),
    onSettled: (_saved, e, p) => {
      plannedUnderWay.end(p.id);
      if (e) qc.invalidateQueries({ queryKey: PLANNER });
    },
  });

  const remove = useMutation({
    mutationFn: backend.deletePlanned,
    scope: { id: 'planner' },
    onMutate: (id: string) => {
      plannedUnderWay.start(id, null);
      qc.setQueryData<Planned[]>(PLANNER, (list = []) => list.filter((x) => x.id !== id));
    },
    onError: (e) => toast(`Couldn’t take that off the Planner. ${e instanceof Error ? e.message : ''}`.trim()),
    onSettled: (_r, e, id) => {
      plannedUnderWay.end(id);
      if (e) qc.invalidateQueries({ queryKey: PLANNER });
    },
  });

  return {
    planned: query.data ?? [],
    loading: query.isPending && enabled,
    loadError: !query.data && query.error instanceof Error ? query.error.message : null,
    reload: () => query.refetch(),
    /** plan a recipe for a day, or move it (the same id, another day) */
    savePlanned: (p: Planned) => save.mutate(p),
    deletePlanned: (id: string) => remove.mutate(id),
  };
}

/**
 * The grocery list (issue #64), loaded like the recipes and kept offline too (it's used in the shop). Every change is
 * one batch (items to save, ids to take off) that shows at once and is sent in the background; if the server refuses
 * it, it's undone with a toast.
 */
export function useGroceries() {
  const qc = useQueryClient();
  const enabled = useAuth().status === 'signedIn';
  const query = useQuery({ queryKey: GROCERIES, queryFn: fetchGroceries, enabled });

  const change = useMutation({
    mutationFn: backend.changeGroceries,
    scope: { id: 'groceries' },
    onMutate: ({ save, remove }: { save: GroceryItem[]; remove: string[] }) => {
      save.forEach((g) => groceriesUnderWay.start(g.id, g));
      remove.forEach((id) => groceriesUnderWay.start(id, null));
      qc.setQueryData<GroceryItem[]>(GROCERIES, (list = []) => save.reduce((out, g) => upsert(out, g), list.filter((g) => !remove.includes(g.id))));
    },
    onError: (e) => toast(`Couldn’t change the grocery list. ${e instanceof Error ? e.message : ''}`.trim()),
    onSettled: (_r, e, { save, remove }) => {
      [...save.map((g) => g.id), ...remove].forEach((id) => groceriesUnderWay.end(id));
      if (e) qc.invalidateQueries({ queryKey: GROCERIES });
    },
  });

  return {
    items: query.data ?? [],
    loading: query.isPending && enabled,
    loadError: !query.data && query.error instanceof Error ? query.error.message : null,
    reload: () => query.refetch(),
    /** save some items (new or changed) and take some off, in one go */
    changeGroceries: (save: GroceryItem[], remove: string[] = []) => change.mutate({ save, remove }),
  };
}

// ── what each ingredient is on the grocery list (issue #64) ──

// names the server couldn't name this time (Claude out of reach): the rules stand in, and they aren't asked about again
// until the app is opened afresh
const notNamed = new Set<string>();
// names being asked about now, so two screens don't ask twice
const naming = new Map<string, Promise<void>>();

const keepNames = (rows: GroceryName[]) =>
  queryClient.setQueryData<GroceryName[]>(GROCERY_NAMES, (list = []) => {
    const byKey = new Map(list.map((n) => [n.key, n]));
    for (const r of rows) byKey.set(r.key, r);
    return [...byKey.values()];
  });

/**
 * Name the ones not named yet: at most 60 a request, three requests at once. Resolves when they're named (or the
 * server couldn't: then the rules stand in for them).
 */
async function nameThese(list: string[]) {
  const known = namesMap(queryClient.getQueryData<GroceryName[]>(GROCERY_NAMES) ?? []);
  const todo = new Map<string, string>();
  const waits: Promise<void>[] = [];
  for (const n of list) {
    const key = nameOf(n);
    if (!key || known.has(key) || notNamed.has(key) || todo.has(key)) continue;
    if (naming.has(key)) waits.push(naming.get(key)!);
    else todo.set(key, n);
  }
  const names = [...todo.values()];
  const batches: string[][] = [];
  for (let i = 0; i < names.length; i += 60) batches.push(names.slice(i, i + 60));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      const done = (async () => {
        try {
          const { names: rows } = await backend.nameGroceries(batch);
          keepNames(rows);
          const got = new Set(rows.map((r) => r.key));
          for (const n of batch) if (!got.has(nameOf(n))) notNamed.add(nameOf(n));
        } catch {
          for (const n of batch) notNamed.add(nameOf(n));
        }
      })();
      for (const n of batch) naming.set(nameOf(n), done);
      await done;
      for (const n of batch) naming.delete(nameOf(n));
    }
  };
  await Promise.all([...Array(Math.min(3, batches.length))].map(worker).concat(waits));
}

/**
 * What each ingredient is on the grocery list (grocery-names.ts), kept offline like the list. `correct` keeps a
 * correction from the phone (Same as…, Rename…), shown at once.
 */
export function useGroceryNames() {
  const qc = useQueryClient();
  const enabled = useAuth().status === 'signedIn';
  const query = useQuery({ queryKey: GROCERY_NAMES, queryFn: backend.listGroceryNames, enabled });
  const names = useMemo(() => namesMap(query.data ?? []), [query.data]);
  return {
    names,
    /** the names have loaded (or can't be: then the rules stand in) */
    settled: !!query.data || query.isError,
    correct: (name: Omit<GroceryName, 'by'>) => {
      keepNames([{ ...name, by: 'you' }]);
      backend.correctGroceryName(name).catch((e) => {
        toast(`Couldn’t keep that change. ${e instanceof Error ? e.message : ''}`.trim());
        qc.invalidateQueries({ queryKey: GROCERY_NAMES });
      });
    },
  };
}

/**
 * The names a screen needs, named while it's open (`active`). `naming` while some are still being named (at most 12
 * seconds: after that the rules stand in, and the answers show when they come).
 */
export function useNamed(list: string[], active: boolean) {
  const { names, settled } = useGroceryNames();
  const missing = settled ? [...new Set(list.map((n) => n.trim()).filter((n) => !isNamed(n, names) && !notNamed.has(nameOf(n))))] : [];
  const sig = missing.join('\n');
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!active || !sig) return;
    let live = true;
    setWaiting(true);
    const stop = setTimeout(() => live && setWaiting(false), 12_000);
    nameThese(sig.split('\n')).finally(() => {
      clearTimeout(stop);
      if (live) setWaiting(false);
    });
    return () => {
      live = false;
      clearTimeout(stop);
    };
  }, [active, sig]);
  return { names, naming: active && (!settled || (waiting && missing.length > 0)) };
}

/**
 * Issue #64: once a session, the library's ingredient names not named yet are named on the server in the background
 * (grocery-names-background.mts), so adding a recipe to the list doesn't wait for Claude. The names are read again a
 * few times while that runs.
 */
export function useNameLibrary(recipes: Recipe[], active: boolean) {
  const { names, settled } = useGroceryNames();
  const qc = useQueryClient();
  useEffect(() => {
    if (!active || !settled || !recipes.length) return;
    let asked = false;
    try {
      asked = sessionStorage.getItem('cookbook.namingLibrary') === '1';
    } catch {
      /* no session storage: ask (the server runs one at a time) */
    }
    if (asked) return;
    const missing = [...new Set(recipes.flatMap((r) => r.ingredients.filter((i) => i.kind !== 'header' && i.name.trim()).map((i) => i.name.trim())))].filter(
      (n) => !isNamed(n, names),
    );
    if (!missing.length) return;
    try {
      sessionStorage.setItem('cookbook.namingLibrary', '1');
    } catch {
      /* as above */
    }
    backend
      .backfillGroceryNames(missing.slice(0, 5000))
      .then(() => [60, 180, 420].forEach((s) => setTimeout(() => qc.invalidateQueries({ queryKey: GROCERY_NAMES }), s * 1000)))
      .catch(() => undefined);
  }, [active, settled, recipes.length]); // eslint-disable-line react-hooks/exhaustive-deps
}
