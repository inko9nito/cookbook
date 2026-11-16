// Getting the newest version into the home-screen app. The service worker keeps the whole app on the phone (so it
// works offline), and an installed app is seldom reloaded from scratch, so after a deploy it can keep running the old
// version.
//
// The service worker also fetches a new version by itself in the background (when the app opens or comes to the
// front) and takes over, but the screen keeps showing the old one until it's reloaded. So "is there a newer service
// worker?" isn't enough: by the time the refresh icon is tapped, the answer can be no while the screen is still old.
// The icon asks the live site which build it is (/version.json, written by vite.config.ts and never kept offline) and
// reloads whenever that differs from the build on screen.

// set by vite.config.ts at build time: the deploy's commit (7 characters, or "local"), and when it was built
declare const __APP_VERSION__: string;
declare const __APP_BUILT__: string;

/** "94448e0 · Nov 16, 6:31 PM": which build is running */
export const appVersion = () => {
  const built = new Date(__APP_BUILT__);
  const when = built.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${__APP_VERSION__} · ${when}`;
};

/** The build the live site serves, or null when it can't be asked (offline, or no version file). */
async function liveBuild(): Promise<{ version: string; built: string } | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const v = await res.json();
    return typeof v?.version === 'string' && typeof v?.built === 'string' ? v : null;
  } catch {
    return null;
  }
}

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
 * Look for a newer version of the app. If the live site serves a different build than the one on screen, the service
 * worker is brought up to date and the app reloads into it (this never returns); otherwise "latest". "unsupported"
 * when there's no service worker and nothing newer (a browser without one, or local dev).
 */
export async function updateApp(): Promise<'latest' | 'unsupported'> {
  const live = await liveBuild();
  const behind = !!live && (live.version !== __APP_VERSION__ || live.built !== __APP_BUILT__);
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  let incoming: ServiceWorker | null = null;
  if (reg) {
    await reg.update().catch(() => undefined);
    incoming = reg.installing ?? reg.waiting;
    if (incoming) await takeOver(incoming);
  }
  if (behind || incoming) {
    window.location.reload();
    return new Promise(() => {});
  }
  return reg ? 'latest' : 'unsupported';
}
