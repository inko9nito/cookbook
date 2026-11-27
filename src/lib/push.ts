// Push notifications for cook mode timers (issue #169), shared by the app and the API.
//
// The phone tells the server when a timer is up (a TimerPush: when, the words, and where to send it), and the server
// sends the push then, so the timer still gets through while iOS has the app paused in the background or the phone is
// locked. The server only ever posts to a browser's own push service (Apple's on the iPhone), never to any other
// address a request names.
import { z } from 'zod';

/** The push services browsers hand out subscriptions on (Apple's for iPhone Safari; Chrome's, Firefox's, Edge's). */
const PUSH_HOSTS = ['web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com'];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:' || u.port || u.username || u.password) return false;
    return PUSH_HOSTS.includes(u.hostname) || u.hostname.endsWith('.notify.windows.com');
  } catch {
    return false;
  }
}

/** A browser's push subscription, as `PushSubscription.toJSON()` gives it. */
export const PushTarget = z.object({
  endpoint: z.string().max(2000).refine(isPushEndpoint, 'isn’t a push service'),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export type PushTarget = z.infer<typeof PushTarget>;

/** One running timer's push: sent at `endsAt` (ms since 1970) to the phone that started it. */
export const TimerPush = z.object({
  id: z.string().regex(/^[\w-]{8,64}$/),
  endsAt: z.number().int(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(300),
  target: PushTarget,
});
export type TimerPush = z.infer<typeof TimerPush>;

/** The longest timer the server will hold. */
export const LONGEST_TIMER_MS = 24 * 60 * 60 * 1000;

/** What the push carries to the service worker (public/push-sw.js shows it). */
export type PushMessage = { title: string; body: string; tag: string };

/** The words of a timer's notification: the recipe's name, then the step and the timer. */
export function timerWords(recipe: string, step: number, label: string): { title: string; body: string } {
  return { title: recipe.slice(0, 120) || 'Recipe', body: `Step ${step}: the ${label} timer is up.`.slice(0, 300) };
}
