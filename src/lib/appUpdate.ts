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

/** `promise`, or undefined once `ms` have passed without an answer. */
const within = <T>(promise: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(resolve, ms))]);

/** Wait for a service worker that's installing to take over (Workbox skipWaiting); give up after 10 seconds. */
function takeOver(incoming: ServiceWorker): Promise<void> {
  return new Promise<void>((resolve) => {
    const settle = () => incoming.state === 'activated' || incoming.state === 'redundant';
    if (settle()) return resolve();
    incoming.addEventListener('statechange', () => settle() && resolve());
    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    setTimeout(resolve, 10000);
  });
}

/** Reload the app. If the page is still here a few seconds later (a reload that didn't go through), open it afresh. */
function reload() {
  window.location.reload();
  setTimeout(() => window.location.replace(window.location.pathname + window.location.search), 4000);
}

/**
 * Bring the service worker up to date (if a newer version is live, it installs and takes over), then reload the app.
 * Never returns. `beforeReload` runs just before the reload (Settings uses it to come back to Settings, issue #48,
 * and to let the icon spin for a moment).
 *
 * Every wait has a limit (#91: on the iPhone the icon spun forever and nothing happened, so one of these never
 * answered): asking for the registration 3s, looking for a new version 5s, a new version taking over 10s. Whatever
 * happens, the app reloads; a version still installing then shows on the next refresh.
 */
export async function updateApp({ beforeReload }: { beforeReload?: () => void | Promise<void> } = {}): Promise<never> {
  try {
    const reg = 'serviceWorker' in navigator ? await within(navigator.serviceWorker.getRegistration(), 3000) : undefined;
    if (reg) {
      await within(reg.update().catch(() => undefined), 5000); // offline: nothing newer to get, the reload still happens
      const incoming = reg.installing ?? reg.waiting;
      if (incoming) await takeOver(incoming);
    }
  } catch {
    /* no service worker to ask: a reload is all there is */
  }
  await beforeReload?.();
  reload();
  return new Promise<never>(() => {});
}
