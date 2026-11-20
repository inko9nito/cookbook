import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

/**
 * Issue #141: navigation without Framework7. Each screen is an ordinary page of the document (the document scrolls, as
 * on any website), and each screen opened is an entry in the browser's history, so Safari's own swipe-back (the tab and
 * the home-screen app both have it) goes back a screen. Going forward and the in-app back button slide with the
 * browser's own View Transitions; Safari's swipe-back already shows its own slide, so a back that didn't start in the
 * app isn't animated again. Each history entry keeps how far its screen was scrolled, so back returns to the same place.
 */

export const BASE = '/next';

export type Route =
  | { name: 'recipes' }
  | { name: 'recipe'; id: string }
  | { name: 'cookbooks' }
  | { name: 'cookbook'; id: string }
  | { name: 'plan' }
  | { name: 'groceries' }
  | { name: 'settings' };

export type Tab = 'recipes' | 'cookbooks' | 'plan' | 'groceries' | 'settings';

export function parse(pathname: string): Route {
  const p = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  const parts = p.split('/').filter(Boolean);
  if (parts[0] === 'recipe' && parts[1]) return { name: 'recipe', id: parts[1] };
  if (parts[0] === 'cookbook' && parts[1]) return { name: 'cookbook', id: parts[1] };
  if (parts[0] === 'cookbooks') return { name: 'cookbooks' };
  if (parts[0] === 'plan') return { name: 'plan' };
  if (parts[0] === 'groceries') return { name: 'groceries' };
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'recipes' };
}

export const pathOf = (r: Route): string => {
  switch (r.name) {
    case 'recipe':
      return `${BASE}/recipe/${r.id}`;
    case 'cookbook':
      return `${BASE}/cookbook/${r.id}`;
    case 'recipes':
      return `${BASE}/`;
    default:
      return `${BASE}/${r.name}`;
  }
};

/** which tab a screen belongs to */
export const tabOf = (r: Route): Tab => (r.name === 'recipe' ? 'recipes' : r.name === 'cookbook' ? 'cookbooks' : r.name);

type State = { y?: number; depth?: number };

let route: Route = parse(location.pathname);
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useRoute = () => useSyncExternalStore(subscribe, () => route);

history.scrollRestoration = 'manual';
const state = (): State => (history.state as State | null) ?? {};
if (state().depth === undefined) history.replaceState({ ...state(), depth: 0 }, '');

/** how deep the current screen is in this tab (0: the tab's first screen) */
export const depth = () => state().depth ?? 0;

type Direction = 'forward' | 'back' | 'none';

// runs the change inside a view transition (when the browser has them), marking the direction for the CSS
function transition(direction: Direction, change: () => void) {
  const start = (document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }).startViewTransition;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (direction === 'none' || !start || reduce) {
    change();
    return;
  }
  document.documentElement.dataset.nav = direction;
  const t = start.call(document, change);
  t.finished.finally(() => delete document.documentElement.dataset.nav);
}

// draws the screen at once (so the transition's new picture is the new screen), then scrolls it to where it was
function show(next: Route, y: number) {
  route = next;
  flushSync(emit);
  window.scrollTo(0, y);
}

/** open a screen (forward), or switch tabs (`tab`: replaces, no slide, the tab's first screen) */
export function go(next: Route, opts: { tab?: boolean } = {}) {
  history.replaceState({ ...state(), y: window.scrollY }, '');
  if (opts.tab) {
    transition('none', () => {
      history.replaceState({ depth: 0, y: 0 } satisfies State, '', pathOf(next));
      show(next, 0);
    });
    return;
  }
  transition('forward', () => {
    history.pushState({ depth: depth() + 1, y: 0 } satisfies State, '', pathOf(next));
    show(next, 0);
  });
}

let backFromApp = false;
/** the in-app back button: history back, with the slide */
export function back() {
  // opened straight onto this screen (nothing in the app to go back to): its tab's first screen
  if (depth() === 0) {
    const tab = tabOf(route);
    go(tab === 'recipes' ? { name: 'recipes' } : ({ name: tab } as Route), { tab: true });
    return;
  }
  backFromApp = true;
  history.back();
}

window.addEventListener('popstate', () => {
  const next = parse(location.pathname);
  const y = state().y ?? 0;
  const animate = backFromApp;
  backFromApp = false;
  transition(animate ? 'back' : 'none', () => show(next, y));
});
