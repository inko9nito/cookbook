/*
  The Prepear export bookmarklet (issue #14, docs/PLAN.md §6, step 2).

  It runs on app.prepear.com in the user's own browser, where they're signed in, and asks Prepear's API for everything
  of theirs, the same way Prepear's own page does (its sign-in cookies go along; no token is read or stored):
    1. the profile (GET /api/v3/profiles/<name>?useCookbooks=true): the user's id, the cookbook list and the meal plans,
    2. the recipe list, 35 at a time (GET /api/v3/profiles/<id>/recipes?skip=…&limit=35),
    3. each cookbook (GET /api/v3/cookbooks/<id>) and meal plan (GET /api/v2/plans/<id>),
    4. each recipe (GET /api/v3/recipes/<id>), including ones a cookbook or plan names that aren't in the list.
  Save file downloads it all as prepear-export-<date>.json, with Prepear's answers unchanged: the Cookbook app
  converts them when importing (src/lib/prepear.ts), so a conversion mistake is fixed there, without exporting again.

  Answers are kept in IndexedDB (on Prepear's site, in this browser) as they arrive, so if the page reloads or the
  phone sleeps, tapping the bookmarklet again carries on where it stopped. Start over clears them.

  `prepearExport` must be self-contained (no imports, nothing from outside the function): the Import from Prepear page
  turns its source into the bookmarklet with `prepearExport.toString()`. Its panel is drawn on Prepear's page, so it's
  styled inline.
*/
export function prepearExport(): void {
  type Json = any;
  const w = window as unknown as Record<string, any>;
  const STORE = '__cookbookExport';
  if (w[STORE]) {
    w[STORE].show();
    return;
  }

  // Prepear's API; anywhere else (the app's own check runs on a fake Prepear at localhost) it's the page's own /api
  const API = /(^|\.)prepear\.com$/.test(location.hostname) ? 'https://api.prepear.com/api' : `${location.origin}/api`;
  const PAGE = 35;
  const PARALLEL = 3;

  // ── where answers are kept while it runs (IndexedDB, so a reload carries on) ──
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('cookbook-export', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('answers');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  const tx = async <T,>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>) => {
    const d = await db;
    return new Promise<T>((resolve, reject) => {
      const r = work(d.transaction('answers', mode).objectStore('answers'));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  };
  const kept = (key: string) => tx<Json>('readonly', (s) => s.get(key)).catch(() => undefined);
  const keep = (key: string, value: Json) => tx('readwrite', (s) => s.put(value, key)).catch(() => undefined);
  const forgetAll = () => tx('readwrite', (s) => s.clear()).catch(() => undefined);

  // ── asking Prepear: its cookies go along; slow or busy answers are tried again ──
  class SignedOut extends Error {}
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const get = async (path: string): Promise<Json> => {
    for (let attempt = 0; ; attempt++) {
      let status = 0;
      try {
        const res = await fetch(API + path, { credentials: 'include', headers: { Accept: 'application/json' } });
        status = res.status;
        if (res.ok) return await res.json();
      } catch {
        /* the network dropped: try again */
      }
      if (status === 401 || status === 403) throw new SignedOut();
      if (status === 404) return null;
      if (attempt >= 4) throw new Error(`${path}: ${status || 'no answer'}`);
      await sleep(1000 * 2 ** attempt);
    }
  };
  // asks once, or uses the answer kept from an earlier run
  const once = async (key: string, path: string): Promise<Json> => {
    const had = await kept(key);
    if (had !== undefined) return had;
    const answer = await get(path);
    await keep(key, answer);
    return answer;
  };

  // ── the panel ──
  const panel = document.createElement('div');
  panel.setAttribute('style', 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));max-width:420px;margin:0 auto;z-index:2147483647;background:#fff;color:#1c1c1e;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.25);padding:14px 16px;font:15px/1.35 -apple-system,system-ui,sans-serif');
  panel.innerHTML = `
    <div style="font-weight:700;font-size:16px;margin-bottom:4px">Cookbook export</div>
    <div data-status style="color:#3a3a3c;margin-bottom:4px">Starting…</div>
    <div data-note style="color:#6e6e73;font-size:13px;margin-bottom:10px">Keep this page open. If it reloads, tap the bookmarklet again: it carries on.</div>
    <div style="display:flex;gap:8px">
      <button data-save disabled style="flex:1;border:0;border-radius:10px;padding:10px;background:#c4421c;color:#fff;font:inherit;font-weight:600;opacity:.45">Save file</button>
      <button data-restart style="border:0;border-radius:10px;padding:10px 12px;background:#f2f2f4;color:#1c1c1e;font:inherit">Start over</button>
      <button data-hide style="border:0;border-radius:10px;padding:10px 12px;background:#f2f2f4;color:#1c1c1e;font:inherit">Hide</button>
    </div>`;
  document.body.appendChild(panel);
  const el = (name: string) => panel.querySelector(`[data-${name}]`) as HTMLElement;
  const say = (text: string) => (el('status').textContent = text);
  const saveButton = el('save') as HTMLButtonElement;
  el('hide').onclick = () => (panel.style.display = 'none');
  // tapped again: show the panel, and carry on if it stopped (signed out, or Prepear stopped answering)
  w[STORE] = {
    show: () => {
      panel.style.display = '';
      if (!running && !result) start();
    },
  };

  let result: Json = null;
  let running = false;

  // ── the export ──
  const run = async () => {
    // who's signed in: the profile name from the address (app.prepear.com/<name>/…), or from Prepear's own account answer
    const fromPath = location.pathname.split('/')[1];
    let slug = fromPath && !['app', 'auth', 'discover', 'recipes', 'checkout'].includes(fromPath) ? fromPath : '';
    if (!slug) {
      const user = await get('/v1/auth/user').catch(() => null);
      const find = (o: Json): string => {
        if (!o || typeof o !== 'object') return '';
        if (typeof o.slug === 'string' && o.slug) return o.slug;
        for (const v of Object.values(o)) {
          const s = find(v);
          if (s) return s;
        }
        return '';
      };
      slug = find(user);
    }
    if (!slug) {
      say('Open your profile in Prepear (tap your picture), then tap the bookmarklet again.');
      return;
    }

    say('Reading your profile…');
    const profile = await once('profile', `/v3/profiles/${encodeURIComponent(slug)}?useCookbooks=true`);
    const userId: string | undefined = profile?.profile?.id;
    if (!userId) throw new Error('Prepear didn’t say who you are. Open your profile in Prepear and try again.');
    const cookbookList: Json[] = profile?.cookbooks?.results ?? [];
    const planList: Json[] = profile?.library?.results ?? [];

    // the recipe list, a page at a time. A page can hold fewer than 35: Prepear leaves out originals of recipes I
    // edited and lists their ids in filteredOriginals instead (30 + 5 on a page), so the total says when it's done.
    const list: Json[] = [];
    const filtered: string[] = [];
    let total = profile?.recipes?.total ?? 0;
    for (let skip = 0; ; skip += PAGE) {
      say(`Listing recipes… ${list.length + filtered.length}${total ? ` of ${total}` : ''}`);
      const page = await once(`list:${skip}`, `/v3/profiles/${userId}/recipes?q=&sort=&skip=${skip}&limit=${PAGE}`);
      const results: Json[] = page?.results ?? [];
      const left: string[] = page?.filteredOriginals ?? [];
      total = page?.total ?? total;
      list.push(...results);
      filtered.push(...left);
      if (!results.length && !left.length) break;
      if (total && skip + PAGE >= total) break;
      if (skip > 20000) break;
    }

    // cookbooks and meal plans
    const cookbooks: Record<string, Json> = {};
    for (const [i, c] of cookbookList.entries()) {
      say(`Cookbooks… ${i + 1} of ${cookbookList.length}`);
      cookbooks[c.id] = await once(`cookbook:${c.id}`, `/v3/cookbooks/${c.id}`);
    }
    const plans: Record<string, Json> = {};
    for (const [i, p] of planList.entries()) {
      say(`Meal plans… ${i + 1} of ${planList.length}`);
      plans[p.id] = await once(`plan:${p.id}`, `/v2/plans/${p.id}`);
    }

    // every recipe: the list's, plus any a cookbook or plan names (a recipe can go by its own id or by the id of the
    // recipe it was adapted from, so an answer covers both)
    const wanted = new Set<string>([...list.map((r) => r.id), ...filtered]);
    for (const c of Object.values(cookbooks)) {
      const book = c?.cookbook;
      if (!book) continue;
      for (const s of book.sections ?? []) for (const id of s.recipes ?? []) wanted.add(id);
      for (const id of book.uncategorizedRecipes ?? []) wanted.add(id);
    }
    for (const p of Object.values(plans))
      for (const week of p?.plan?.weeks ?? []) for (const day of week?.days ?? []) for (const meal of day?.meals ?? []) if (meal?.recipeId) wanted.add(meal.recipeId);

    const recipes: Record<string, Json> = {};
    const covered = new Set<string>();
    const cover = (answer: Json) => {
      for (const side of [answer?.adapted, answer?.original]) {
        if (side?.recipe?.id) covered.add(side.recipe.id);
        if (side?.meta?.preferred_adapted_id) covered.add(side.meta.preferred_adapted_id);
      }
    };
    const failed: { id: string; error: string }[] = [];
    const queue = [...wanted];
    let done = 0;
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        if (!covered.has(id)) {
          try {
            const answer = await once(`recipe:${id}`, `/v3/recipes/${id}`);
            if (answer) {
              recipes[id] = answer;
              cover(answer);
            } else failed.push({ id, error: 'not found' });
          } catch (e) {
            if (e instanceof SignedOut) throw e;
            failed.push({ id, error: String((e as Error).message ?? e) });
          }
        }
        covered.add(id);
        done++;
        say(`Recipes… ${done} of ${wanted.size}`);
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));

    result = {
      format: 'prepear-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: { id: userId, slug, recipeTotal: total },
      recipeList: list,
      filteredOriginals: filtered,
      recipes,
      cookbookList,
      cookbooks,
      planList,
      plans,
      failed,
    };
    const books = Object.keys(cookbooks).length;
    const counts = `${Object.keys(recipes).length} recipes, ${books} cookbook${books === 1 ? "" : "s"}, ${Object.keys(plans).length} meal plan${Object.keys(plans).length === 1 ? '' : 's'}`;
    say(failed.length ? `Done: ${counts}. ${failed.length} couldn’t be read (listed in the file).` : `Done: ${counts}.`);
    el('note').textContent = 'Tap Save file, then choose that file in the Cookbook app: Settings → From Prepear.';
    saveButton.disabled = false;
    saveButton.style.opacity = '1';
  };

  const start = () => {
    running = true;
    run()
      .catch((e) =>
        say(e instanceof SignedOut ? 'Prepear says you’re signed out. Sign in, then tap the bookmarklet again.' : `Stopped: ${(e as Error).message ?? e}. Tap the bookmarklet again to carry on.`),
      )
      .finally(() => (running = false));
  };

  saveButton.onclick = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prepear-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    saveButton.textContent = 'Saved';
  };
  el('restart').onclick = async () => {
    if (running) return say('Still exporting: wait for it to finish (or reload the page), then Start over.');
    if (!confirm('Start the export over from the beginning?')) return;
    await forgetAll();
    result = null;
    saveButton.disabled = true;
    saveButton.style.opacity = '.45';
    saveButton.textContent = 'Save file';
    start();
  };

  start();
}
