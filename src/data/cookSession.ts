// Cook mode kept on the phone (issue #85), so it outlasts iOS reloading the app. iOS often reloads a home-screen app
// you switched away from (to the timer, a message, the camera); the app then came back without cook mode, its ticks or
// its timers.
//
// What's kept: the recipes open in cook mode and the one shown, whether cook mode was open or tucked away (the Cooking
// button), the amounts and unit picks, what's ticked, the running timers (as the time they end, so they keep counting
// while the app is away) and where each half was scrolled to. Done cooking forgets it.
//
// Kept in localStorage (it has to outlast the app being closed, which sessionStorage may not). A session left for more
// than 12 hours isn't brought back: that's yesterday's dinner, not a recipe still on the stove. Storage can be missing
// or refuse (a private window); cook mode then works as before, it just doesn't come back after a reload.
import { z } from 'zod';

const KEY = 'cookbook.cookSession';
/** how long a cook session is brought back after the last change to it */
export const KEEP_MS = 12 * 60 * 60 * 1000;

const Picks = z.record(z.string(), z.string());
const SavedCook = z.object({
  open: z.array(z.string()).min(1),
  shown: z.string(),
  expanded: z.boolean(),
  ticks: z.record(z.string(), z.object({ ing: z.array(z.string()), steps: z.array(z.string()) })),
  amounts: z.record(z.string(), z.object({ factor: z.number().positive(), picks: Picks })),
  // key (issue #169): the timer's push on the server; missing in sessions kept before it
  timers: z.array(z.object({ recipeId: z.string(), label: z.string(), step: z.number(), endsAt: z.number(), key: z.string().optional() })),
  scroll: z.record(z.string(), z.object({ ing: z.number(), steps: z.number() })),
  savedAt: z.number(),
});
export type SavedCook = z.infer<typeof SavedCook>;
export type PaneScroll = SavedCook['scroll'][string];

/** The cook session kept on the phone, unless there's none, it's unreadable or it's too old. */
export function loadCook(): SavedCook | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = SavedCook.safeParse(JSON.parse(raw));
    if (s.success && Date.now() - s.data.savedAt < KEEP_MS) return s.data;
    localStorage.removeItem(KEY);
  } catch {
    /* no storage, or not JSON: nothing to bring back */
  }
  return null;
}

export function saveCook(s: Omit<SavedCook, 'savedAt'>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, savedAt: Date.now() }));
  } catch {
    /* no storage: cook mode just doesn't come back after a reload */
  }
}

export function forgetCook() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* no storage */
  }
}
