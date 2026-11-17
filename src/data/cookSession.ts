// Cook mode survives leaving the app (issue #85). iOS often reloads a home-screen app you switched away from (to the
// timer, a message, the camera), and the app then opened on Recipes with cook mode, its ticks and its timers gone.
//
// While cook mode is open it keeps what it shows here: the recipe and the tab it was opened in, the recipes open as
// tabs and the one shown, the amounts and unit picks, what's ticked, the running timers (as the time they end, so they
// keep counting while the app is away) and where each half was scrolled to. When the app opens with one saved, it goes
// back into cook mode where it was. Closing cook mode forgets it.
//
// Kept in localStorage (it has to outlast the app being closed, which sessionStorage may not). A session left for more
// than 12 hours isn't reopened: that's yesterday's dinner, not a recipe still on the stove. Storage can be missing or
// refuse (a private window); cook mode then works as before, it just isn't reopened.
import { z } from 'zod';
import type { TabId } from './startTab';

const KEY = 'cookbook.cookSession';
const TABS = ['recipes', 'cookbooks', 'plan', 'groceries', 'settings'] as const satisfies readonly TabId[];
/** how long a cook session is reopened after the last change to it */
export const KEEP_MS = 12 * 60 * 60 * 1000;

const Picks = z.record(z.string(), z.string());
const SavedCook = z.object({
  tab: z.enum(TABS),
  /** the recipe cook mode was started from */
  recipeId: z.string(),
  factor: z.number().positive(),
  picks: Picks,
  open: z.array(z.string()),
  shown: z.string(),
  ticks: z.record(z.string(), z.object({ ing: z.array(z.string()), steps: z.array(z.string()) })),
  amounts: z.record(z.string(), z.object({ factor: z.number().positive(), picks: Picks })),
  timers: z.array(z.object({ recipeId: z.string(), label: z.string(), step: z.number(), endsAt: z.number() })),
  scroll: z.record(z.string(), z.object({ ing: z.number(), steps: z.number() })),
  savedAt: z.number(),
});
export type SavedCook = z.infer<typeof SavedCook>;
export type PaneScroll = SavedCook['scroll'][string];

/** The cook session kept on the phone, unless there's none, it's unreadable or it's too old. */
function read(): SavedCook | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = SavedCook.safeParse(JSON.parse(raw));
    if (s.success && Date.now() - s.data.savedAt < KEEP_MS) return s.data;
    localStorage.removeItem(KEY);
  } catch {
    /* no storage, or not JSON: nothing to reopen */
  }
  return null;
}

export function saveCook(s: Omit<SavedCook, 'savedAt'>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, savedAt: Date.now() }));
  } catch {
    /* no storage: cook mode just isn't reopened */
  }
}

/** Cook mode was closed: don't reopen it. */
export function forgetCook() {
  pending = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no storage */
  }
}

// read once, as the app loads: the session to go back into, until the recipe page takes it
let pending: SavedCook | null = read();

/** The cook session to reopen as the app starts, if any (App.tsx opens its tab and recipe page). */
export const cookToResume = () => pending;

/** The recipe page opening cook mode where it was: the saved session for this recipe, given once. */
export function takeCookFor(recipeId: string): SavedCook | null {
  if (pending?.recipeId !== recipeId) return null;
  const s = pending;
  pending = null;
  return s;
}

/** The app opened with a session for a recipe that's gone (deleted on another device). */
export function dropPendingCook() {
  if (pending) forgetCook();
}
