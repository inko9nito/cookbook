import { useEffect } from 'react';
import { useAuth } from './auth';
import { useStore } from './store';

// ?loader keeps the launch loader on screen to look at (index.html). Read once, as the app loads.
const keepLoader = new URLSearchParams(location.search).has('loader');

/**
 * Takes the launch loader (the boiling pot in index.html) out of the page, in one frame: the app is there at once, as
 * HPDE's is. A fade showed the pot as a ghost over a washed-out page for a quarter of a second, which read as a flash
 * (and iOS kept that half-faded frame as the app's picture, shown as the next launch zoomed in).
 */
export function hideLaunchLoader() {
  if (keepLoader) return;
  document.getElementById('ck-launch')?.remove();
}

// How long the loader waits, once the recipes are there, for the photos on screen to load. They're mostly in the
// phone's photo cache, so this is usually much less; past it, the app shows with those photos still coming.
const PHOTO_WAIT_MS = 800;

/** The photos the first screen shows, as their addresses: recipe cards and cookbook plates on screen (CSS backgrounds). */
function photosOnScreen(): string[] {
  const urls = new Set<string>();
  document.querySelectorAll<HTMLElement>('.view.tab-active .page-current [style*="background-image"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || !r.width) return;
    const m = /url\(["']?(.*?)["']?\)/.exec(el.style.backgroundImage);
    if (m) urls.add(m[1]);
  });
  return [...urls];
}

/** Resolves once the photo is loaded and ready to draw (or failed: then there's nothing to wait for). */
function loaded(url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  return img.decode().catch(() => undefined);
}

/** The first screen is ready: wait (a little) for its photos, so the app appears whole, then take the loader away. */
async function showApp() {
  await new Promise((r) => requestAnimationFrame(r)); // the screen's cards are laid out
  await Promise.race([Promise.all(photosOnScreen().map(loaded)), new Promise((r) => setTimeout(r, PHOTO_WAIT_MS))]);
  hideLaunchLoader();
}

// Never longer than this: after it, the screens' own placeholders (issue #35) show what's coming.
const MAX_MS = 2500;

/**
 * Takes the launch loader away once the first screen has something to show: the recipes (from the phone's cache or the
 * server) and the photos on screen (up to PHOTO_WAIT_MS), or the sign-in screen. Never waiting for the animation.
 */
export function LaunchLoaderDone() {
  const { status } = useAuth();
  const { loading } = useStore();
  const ready = status === 'signedOut' || (status === 'signedIn' && !loading);
  useEffect(() => {
    if (ready) void showApp();
  }, [ready]);
  useEffect(() => {
    const t = setTimeout(hideLaunchLoader, MAX_MS);
    return () => clearTimeout(t);
  }, []);
  return null;
}
