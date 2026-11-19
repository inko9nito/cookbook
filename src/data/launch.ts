import { useEffect } from 'react';

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

// The most the full-height wait below can add, from the moment the page starts.
const MAX_MS = 2500;
const deadline = () => new Promise<void>((r) => setTimeout(r, Math.max(0, MAX_MS - performance.now())));

/**
 * In the home-screen app the page starts out shorter than the screen and grows to full height a moment later (index.html
 * lays the loader out on the screen's height meanwhile). Drawn before that, the app was laid out short: its tab bar
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
 * The pot covers only the app starting up: it goes as soon as the app can draw its first screen (styles and code loaded,
 * the screen laid out, at full height in the home-screen app). From there the screens' skeletons (issue #35) show while
 * the recipes load, and photos fill in as they arrive. It doesn't wait for recipes or photos: waiting for photos (by
 * loading and decoding copies) left them blank in the grid on iPhone Safari.
 */
export function LaunchLoaderDone() {
  useEffect(() => {
    let live = true;
    requestAnimationFrame(async () => {
      await Promise.race([fullHeight(), deadline()]);
      if (live) hideLaunchLoader();
    });
    return () => {
      live = false;
    };
  }, []);
  return null;
}
