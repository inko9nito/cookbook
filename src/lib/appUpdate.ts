// The refresh icon in Settings → Version: get the newest version into the home-screen app, and reload it either way.
// The service worker keeps the whole app on the phone (so it works offline), and an installed app is seldom reloaded
// from scratch, so after a deploy it can keep running the old version. The service worker also fetches a new version
// by itself in the background (when the app opens or comes to the front) and takes over, but the screen keeps showing
// the old one until it's reloaded.
//
// The icon is also the home-screen app's only way to reload (it has no pull-to-refresh), to get out of a bug, so it
// reloads even when there's nothing newer (issue #91). A reload always shows the version the service worker has, so
// the only thing to do first is let it look for a newer one and wait for that to take over.

// set by vite.config.ts at build time: the deploy's commit (7 characters, or "local"), and when it was built
declare const __APP_VERSION__: string;
declare const __APP_BUILT__: string;

/** "94448e0 · Nov 16, 6:31 PM": which build is running */
export const appVersion = () => {
  const built = new Date(__APP_BUILT__);
  const when = built.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${__APP_VERSION__} · ${when}`;
};

/** Wait for a service worker that's installing to take over (Workbox skipWaiting); give up after 20 seconds. */
function takeOver(incoming: ServiceWorker): Promise<void> {
  return new Promise<void>((resolve) => {
    const settle = () => incoming.state === 'activated' || incoming.state === 'redundant';
    if (settle()) return resolve();
    incoming.addEventListener('statechange', () => settle() && resolve());
    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    setTimeout(resolve, 20000);
  });
}

/**
 * Bring the service worker up to date (if a newer version is live, it installs and takes over), then reload the app.
 * Never returns. `beforeReload` runs just before the reload (Settings uses it to come back to Settings, issue #48,
 * and to let the icon spin for a moment).
 */
export async function updateApp({ beforeReload }: { beforeReload?: () => void | Promise<void> } = {}): Promise<never> {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) {
      await reg.update().catch(() => undefined); // offline: nothing newer to get, the reload still happens
      const incoming = reg.installing ?? reg.waiting;
      if (incoming) await takeOver(incoming);
    }
  } catch {
    /* no service worker to ask: a reload is all there is */
  }
  await beforeReload?.();
  window.location.reload();
  return new Promise<never>(() => {});
}
