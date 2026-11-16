// Getting the newest version into the home-screen app. The service worker keeps the whole app on the phone (so it
// works offline), and an installed app is seldom reloaded from scratch, so after a deploy it can keep running the old
// version. This asks the service worker to look for a new one, waits for it to take over, and reloads into it.

// set by vite.config.ts at build time: the deploy's commit (7 characters, or "local"), and when it was built
declare const __APP_VERSION__: string;
declare const __APP_BUILT__: string;

/** "94448e0 · Nov 16, 6:31 PM": which build is running */
export const appVersion = () => {
  const built = new Date(__APP_BUILT__);
  const when = built.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${__APP_VERSION__} · ${when}`;
};

/**
 * Look for a newer version of the app. If there is one, it's installed and the app reloads into it (this never
 * returns); otherwise "latest". "unsupported" when there's no service worker (a browser without one, or local dev).
 */
export async function updateApp(): Promise<'latest' | 'unsupported'> {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'unsupported';
  await reg.update();
  const incoming = reg.installing ?? reg.waiting;
  if (!incoming) return 'latest';
  // the app's service worker takes over as soon as it's installed (Workbox skipWaiting, set by registerType
  // autoUpdate); wait for that, then load the new version. Give up waiting after 20 seconds and reload anyway.
  await new Promise<void>((resolve) => {
    const settle = () => incoming.state === 'activated' || incoming.state === 'redundant';
    if (settle()) return resolve();
    incoming.addEventListener('statechange', () => settle() && resolve());
    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    setTimeout(resolve, 20000);
  });
  window.location.reload();
  return new Promise(() => {});
}
