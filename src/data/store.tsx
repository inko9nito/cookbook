// The app's recipes and settings, from the API (or the demo backend), through TanStack Query.
// Changes show at once (optimistic) and are sent in the background; if the server refuses, they're undone with a toast.
// On the live site the cache is kept in IndexedDB, so recipes open offline in the kitchen.

import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, set } from 'idb-keyval';
import { f7 } from 'framework7-react';
import { ApiError, backend, isDemo } from './api';
import { useAuth } from './auth';
import { Settings, type Recipe, type SortKey } from '../lib/recipe';
import type { Cookbook } from '../lib/cookbook';

const RECIPES = ['recipes'] as const;
const SETTINGS = ['settings'] as const;
const COOKBOOKS = ['cookbooks'] as const;
const DAY = 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { gcTime: 30 * DAY, staleTime: 60 * 1000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 },
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
  const recipesQuery = useQuery({ queryKey: RECIPES, queryFn: backend.listRecipes, enabled });
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

  const recipesQuery = useQuery({ queryKey: RECIPES, queryFn: backend.listRecipes, enabled });
  const settingsQuery = useQuery({ queryKey: SETTINGS, queryFn: backend.getSettings, enabled });

  const save = useMutation({
    mutationFn: async (r: Recipe) => backend.saveRecipe(await withUploadedPhotos(r)),
    onMutate: async (r) => {
      await qc.cancelQueries({ queryKey: RECIPES });
      const before = qc.getQueryData<Recipe[]>(RECIPES);
      qc.setQueryData<Recipe[]>(RECIPES, (list = []) => (list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [r, ...list]));
      return { before };
    },
    onError: (e, _r, ctx) => {
      qc.setQueryData(RECIPES, ctx?.before);
      toast(`Couldn’t save the recipe. ${e instanceof Error ? e.message : ''}`.trim());
    },
    onSuccess: (saved) => qc.setQueryData<Recipe[]>(RECIPES, (list = []) => list.map((x) => (x.id === saved.id ? saved : x))),
  });

  const remove = useMutation({
    mutationFn: backend.deleteRecipe,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: RECIPES });
      const before = qc.getQueryData<Recipe[]>(RECIPES);
      qc.setQueryData<Recipe[]>(RECIPES, (list = []) => list.filter((x) => x.id !== id));
      return { before };
    },
    onError: (e, _id, ctx) => {
      qc.setQueryData(RECIPES, ctx?.before);
      toast(`Couldn’t delete the recipe. ${e instanceof Error ? e.message : ''}`.trim());
    },
    // the recipe also left every cookbook it was in (the database does that)
    onSettled: () => qc.invalidateQueries({ queryKey: COOKBOOKS }),
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
  const query = useQuery({ queryKey: COOKBOOKS, queryFn: backend.listCookbooks, enabled });

  const save = useMutation({
    mutationFn: backend.saveCookbook,
    onMutate: async (c: Cookbook) => {
      await qc.cancelQueries({ queryKey: COOKBOOKS });
      const before = qc.getQueryData<Cookbook[]>(COOKBOOKS);
      qc.setQueryData<Cookbook[]>(COOKBOOKS, (list = []) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c]));
      return { before };
    },
    onError: (e, _c, ctx) => {
      qc.setQueryData(COOKBOOKS, ctx?.before);
      toast(`Couldn’t save the cookbook. ${e instanceof Error ? e.message : ''}`.trim());
    },
    onSuccess: (saved) => qc.setQueryData<Cookbook[]>(COOKBOOKS, (list = []) => list.map((x) => (x.id === saved.id ? saved : x))),
  });

  const remove = useMutation({
    mutationFn: backend.deleteCookbook,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: COOKBOOKS });
      const before = qc.getQueryData<Cookbook[]>(COOKBOOKS);
      qc.setQueryData<Cookbook[]>(COOKBOOKS, (list = []) => list.filter((x) => x.id !== id));
      return { before };
    },
    onError: (e, _id, ctx) => {
      qc.setQueryData(COOKBOOKS, ctx?.before);
      toast(`Couldn’t delete the cookbook. ${e instanceof Error ? e.message : ''}`.trim());
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
      qc.setQueryData<Cookbook[]>(COOKBOOKS, (list = []) => (list.some((x) => x.id === saved.id) ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved]));
      return saved;
    },
    deleteCookbook: (id: string) => remove.mutate(id),
  };
}
