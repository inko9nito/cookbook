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

// Never longer than this, from the moment the page starts: after it, the screens' own placeholders (issue #35) show
// what's coming, and photos still on their way draw in as they arrive.
const MAX_MS = 2500;
const deadline = () => new Promise<void>((r) => setTimeout(r, Math.max(0, MAX_MS - performance.now())));

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

/**
 * In the home-screen app the page starts out shorter than the screen and grows to full height a moment later (index.html
 * lays the loader out on the screen's height meanwhile). Shown before that, the app was laid out short: its tab bar
 * floated well above the bottom, with white below it. Resolves once the page is the screen's full height, or has grown
 * since it started (index.html notes its first height; a moment after it last grew, in case iOS stops short of the
 * screen), and at once anywhere else.
 */
function fullHeight(): Promise<void> {
  if (!document.documentElement.style.getPropertyValue('--ck-launch-h')) return Promise.resolve(); // not the home-screen app
  const startHeight = Number(document.documentElement.dataset.ckStartHeight) || 0;
  const grown = () => innerHeight >= screen.height - 1 || innerHeight > startHeight;
  return new Promise((resolve) => {
    let settle: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      removeEventListener('resize', check);
      clearTimeout(settle);
      resolve();
    };
    function check() {
      if (innerHeight >= screen.height - 1) return done();
      clearTimeout(settle);
      settle = setTimeout(done, 300);
    }
    addEventListener('resize', check);
    if (grown()) done(); // it already has
  });
}

/**
 * The first screen is ready: wait for the page to reach its full height and for the photos on screen to load (within
 * the time limit), so the app appears whole and in place, then take the loader away.
 */
async function showApp() {
  await new Promise((r) => requestAnimationFrame(r)); // the screen's cards are laid out
  await Promise.race([Promise.all([fullHeight(), ...photosOnScreen().map(loaded)]), deadline()]);
  hideLaunchLoader();
}

/**
 * Takes the launch loader away once the first screen has something to show: the recipes (from the phone's cache or the
 * server), the photos on screen and, in the home-screen app, the page's full height; or the sign-in screen. Within MAX_MS
 * of the page starting, and never waiting for the animation.
 */
export function LaunchLoaderDone() {
  const { status } = useAuth();
  const { loading } = useStore();
  const ready = status === 'signedOut' || (status === 'signedIn' && !loading);
  useEffect(() => {
    if (ready) void showApp();
  }, [ready]);
  useEffect(() => {
    const t = setTimeout(hideLaunchLoader, Math.max(0, MAX_MS - performance.now()));
    return () => clearTimeout(t);
  }, []);
  return null;
}
