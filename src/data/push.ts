// Push notifications and the app icon's badge for cook mode (issue #169).
//
// The badge counts the recipes open in cook mode. A timer started in cook mode is held on the server too
// (netlify/lib/push.ts), which sends a push when it's up, so it gets through while iOS has the app paused or the phone
// is locked; the app still rings as before when it's open. iPhone Safari does both only in the home-screen app, and only
// once notifications are allowed: the app asks the first time a timer is started (the user's choice), in that tap,
// since iOS only asks from one. Settings → Timer Notifications turns both off on this phone.
import { useSyncExternalStore } from 'react';
import { backend, isDemo } from './api';
import type { PushTarget } from '../lib/push';

const KEY = 'cookbook.timerPush';

type PushState = { supported: boolean; wanted: boolean; permission: NotificationPermission };

const supported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
const wanted = () => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
};
const read = (): PushState => ({ supported: supported(), wanted: wanted(), permission: supported() ? Notification.permission : 'denied' });

let state = read();
const listeners = new Set<() => void>();
function refresh() {
  const next = read();
  if (next.supported === state.supported && next.wanted === state.wanted && next.permission === state.permission) return;
  state = next;
  listeners.forEach((f) => f());
}
// notifications can be turned off in iPhone Settings while the app is away
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh());

export function usePush(): PushState {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => state,
  );
}

/** Pushes and the badge are on: allowed by iOS, and not turned off in Settings. */
export const pushOn = (s: PushState = state) => s.supported && s.wanted && s.permission === 'granted';

/** In a tap (a timer starting, or the Settings switch): the first time, iOS asks whether the app may send notifications. */
export function askForPush() {
  if (!state.supported || !state.wanted || Notification.permission !== 'default') return;
  Notification.requestPermission().then(refresh, refresh);
}

/** Settings → Timer Notifications, on this phone. */
export function setPushWanted(on: boolean) {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    /* no storage: it stays as it is */
  }
  refresh();
  if (on) askForPush();
}

/** The app icon's badge: how many recipes are open in cook mode; none, or pushes turned off: no badge. */
export function showBadge(n: number) {
  const count = pushOn() ? n : 0;
  if (isDemo) (window as unknown as { ckBadge?: number }).ckBadge = count;
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    (count ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => {});
  } catch {
    /* no badge here (a Safari tab) */
  }
}

// ── this phone's push subscription: where the server sends its timers' pushes ──

const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

const bytesOf = (base64url: string) => {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};
const sameBytes = (a: ArrayBuffer | null, b: Uint8Array) => {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
};

async function subscribe(): Promise<PushTarget | null> {
  const reg = await within(navigator.serviceWorker.ready, 5000);
  if (!reg) return null;
  const key = bytesOf(await backend.pushKey());
  let sub = await reg.pushManager.getSubscription();
  // subscribed with another key (it changed on the server): subscribe again
  if (sub && !sameBytes(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const { endpoint, keys } = sub.toJSON();
  return endpoint && keys?.p256dh && keys.auth ? { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } : null;
}

let subscribing: Promise<PushTarget | null> | null = null;

/** Where the server sends this phone's pushes, or null when pushes are off or the phone couldn't subscribe. */
export function pushTarget(): Promise<PushTarget | null> {
  if (!pushOn()) return Promise.resolve(null);
  // the demo (locally) has no push service
  if (isDemo) return Promise.resolve({ endpoint: 'https://web.push.apple.com/demo', keys: { p256dh: 'demo', auth: 'demo' } });
  subscribing ??= subscribe()
    .catch(() => null)
    .then((t) => {
      if (!t) subscribing = null; // try again next time
      return t;
    });
  return subscribing;
}
