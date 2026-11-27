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

/** Settings → Timer Notifications, on this phone. */
export function setPushWanted(on: boolean) {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    /* no storage: it stays as it is */
  }
  refresh();
  if (on) {
    askForPush();
    void warmUpPush();
  }
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
//
// iPhone Safari only lets the app subscribe from inside a tap (the first version subscribed a moment later, after
// fetching the server's key, and iOS refused, so no push ever came: #169). So the service worker's registration and
// the server's key are fetched ahead (`warmUpPush`, once signed in), and the timer's tap subscribes at once: on the
// first timer, that also asks iOS for permission.

const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

const bytesOf = (base64url: string) => {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
};
const sameBytes = (a: ArrayBuffer | null, b: Uint8Array) => {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
};
const targetOf = (sub: PushSubscription | null): PushTarget | null => {
  const { endpoint, keys } = sub?.toJSON() ?? {};
  return endpoint && keys?.p256dh && keys.auth ? { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } : null;
};

/** fetched ahead, so a tap can subscribe without waiting */
let ready: { reg: ServiceWorkerRegistration; key: Uint8Array<ArrayBuffer> } | null = null;
let warming: Promise<void> | null = null;
/** this phone's subscription once known (null: none yet) */
let target: PushTarget | null = null;
/** why the last try to subscribe failed, for the message the app shows */
let lastError = '';

/** Fetch the service worker's registration and the server's key, and pick up a subscription made before. */
export function warmUpPush(): Promise<void> {
  if (isDemo || !state.supported || !state.wanted || state.permission === 'denied') return Promise.resolve();
  warming ??= (async () => {
    const reg = await within(navigator.serviceWorker.ready, 10000);
    if (!reg) throw new Error('the app’s offline worker isn’t running');
    const key = bytesOf(await backend.pushKey());
    ready = { reg, key };
    const sub = await reg.pushManager.getSubscription();
    // subscribed with another key (it changed on the server): that one's no use; the next tap subscribes again
    if (sub && !sameBytes(sub.options.applicationServerKey, key)) await sub.unsubscribe().catch(() => {});
    else target = targetOf(sub);
  })().catch((e) => {
    lastError = e instanceof Error ? e.message : String(e);
    warming = null; // try again next time
  });
  return warming;
}

/** a subscribe on its way (the tap's), which the timer waits for rather than starting another */
let subscribing: Promise<PushTarget | null> | null = null;

function subscribeNow(): Promise<PushTarget | null> {
  if (!ready) return Promise.resolve(null);
  subscribing = ready.reg.pushManager
    .subscribe({ userVisibleOnly: true, applicationServerKey: ready.key })
    .then((sub) => (target = targetOf(sub)))
    .catch((e) => {
      lastError = e instanceof Error ? e.message : String(e);
      return null;
    })
    .finally(() => {
      subscribing = null;
      refresh();
    });
  return subscribing;
}

/**
 * In a tap (a timer starting, or the Settings switch), before anything else: subscribe this phone, which asks iOS
 * for permission the first time. Without what's fetched ahead (still on its way, or offline), it only asks for
 * permission; the next tap subscribes.
 */
export function askForPush() {
  if (!state.supported || !state.wanted || state.permission === 'denied' || target) return;
  if (isDemo || !ready) {
    if (Notification.permission === 'default') Notification.requestPermission().then(refresh, refresh);
    return;
  }
  void subscribeNow();
}

/** Where the server sends this phone's pushes, or null when pushes are off or the phone isn't subscribed. */
export async function pushTarget(): Promise<PushTarget | null> {
  if (!pushOn()) return null;
  // the demo (locally) has no push service
  if (isDemo) return { endpoint: 'https://web.push.apple.com/demo', keys: { p256dh: 'demo', auth: 'demo' } };
  if (target) return target;
  if (subscribing) await subscribing;
  if (target) return target;
  await warmUpPush();
  if (target) return target;
  // not subscribed yet: browsers that allow it outside a tap (not iPhone Safari) subscribe now
  return subscribeNow();
}

/** Why this phone couldn't subscribe, last time it tried. */
export const pushError = () => lastError || 'the phone didn’t give the app a place to send notifications';
