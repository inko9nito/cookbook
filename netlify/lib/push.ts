// Cook mode timers' pushes (issue #169), kept in Netlify Database and sent with the Web Push protocol.
// netlify/functions/push.mts saves and cancels them; push-timer-background.mts waits for one and sends it. The tests
// (push.test.ts) run these against a local database.
//
// Sending on time: a scheduled function runs at most once a minute (and only on the production deploy), so each timer
// gets a background function of its own instead, started when the timer is. A background function may run for 15
// minutes: one waits until its timer is up and sends the push; a longer timer's waits 13 minutes and starts the next.

import type { getDatabase } from '@netlify/database';
import webpush from 'web-push';
import { LONGEST_TIMER_MS, TimerPush, type PushMessage, type PushTarget } from '../../src/lib/push';
import { NotYours } from './recipes';

type Sql = ReturnType<typeof getDatabase>['sql'];

type Row = { id: string; ends_at: Date | string; title: string; body: string; target: PushTarget | string };
const toTimer = (r: Row): TimerPush => ({
  id: r.id,
  endsAt: new Date(r.ends_at).getTime(),
  title: r.title,
  body: r.body,
  target: typeof r.target === 'string' ? JSON.parse(r.target) : r.target,
});

/** The timer is already up, or further off than the server holds one. */
export class BadTime extends Error {}

/** Hold a running timer's push (the same id again changes it); the owner's own, never another's. */
export async function saveTimer(sql: Sql, owner: string, input: unknown, now = Date.now()): Promise<TimerPush> {
  const t = TimerPush.parse(input);
  if (t.endsAt < now - 60_000 || t.endsAt > now + LONGEST_TIMER_MS) throw new BadTime('That timer’s time isn’t right.');
  // timers whose push never went (a background function that died) are dropped after a day
  await sql`DELETE FROM push_timers WHERE ends_at < now() - interval '1 day'`;
  const rows = await sql<{ id: string }>`
    INSERT INTO push_timers (id, owner_id, ends_at, title, body, target)
    VALUES (${t.id}, ${owner}, to_timestamp(${t.endsAt / 1000}), ${t.title}, ${t.body}, ${JSON.stringify(t.target)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET ends_at = EXCLUDED.ends_at, title = EXCLUDED.title, body = EXCLUDED.body, target = EXCLUDED.target
    WHERE push_timers.owner_id = EXCLUDED.owner_id
    RETURNING id`;
  if (!rows.length) throw new NotYours('That timer isn’t yours.');
  return t;
}

/** The timer was stopped on the phone: no push. */
export async function cancelTimer(sql: Sql, owner: string, id: string): Promise<void> {
  await sql`DELETE FROM push_timers WHERE id = ${id} AND owner_id = ${owner}`;
}

export async function timerOf(sql: Sql, id: string): Promise<TimerPush | null> {
  const [row] = await sql<Row>`SELECT id, ends_at, title, body, target FROM push_timers WHERE id = ${id}`;
  return row ? toTimer(row) : null;
}

/** Take the timer to send its push: only one taker gets it, so the push goes once however many waited for it. */
export async function takeTimer(sql: Sql, id: string): Promise<TimerPush | null> {
  const [row] = await sql<Row>`DELETE FROM push_timers WHERE id = ${id} RETURNING id, ends_at, title, body, target`;
  return row ? toTimer(row) : null;
}

/** How long one background function waits before handing a long timer to the next (they may run 15 minutes). */
export const HOP_MS = 13 * 60_000;

export type Waiting = {
  sql: Sql;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** start the next background function for this timer */
  relay: (id: string) => Promise<void>;
  send: (t: TimerPush) => Promise<void>;
};

/**
 * One background function's part in a timer: wait until it's up and send its push, or, for a timer further off than
 * one may wait, wait as long as it may and hand it to the next. A timer stopped meanwhile is gone from the table, so
 * nothing is sent. Anyone could start this for a timer's id (the ids are random), but it only ever sends the push on time.
 */
export async function runTimer(w: Waiting, id: string): Promise<'sent' | 'relayed' | 'gone'> {
  const t = await timerOf(w.sql, id);
  if (!t) return 'gone';
  const wait = t.endsAt - w.now();
  if (wait > HOP_MS) {
    await w.sleep(HOP_MS);
    if (!(await timerOf(w.sql, id))) return 'gone';
    await w.relay(id);
    return 'relayed';
  }
  if (wait > 0) await w.sleep(wait);
  const due = await takeTimer(w.sql, id);
  if (!due) return 'gone';
  await w.send(due);
  return 'sent';
}

// ── the Web Push keys (VAPID): the server's own, which the phone subscribes with ──

export type Keys = { publicKey: string; privateKey: string };
type KeyStore = {
  get: (key: string, opts: { type: 'json' }) => Promise<unknown>;
  setJSON: (key: string, value: unknown, opts: { onlyIfNew: boolean }) => Promise<unknown>;
};

/**
 * The keys from the site's environment variables when they're set (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY), else made
 * once and kept in Blobs (store `push`), which every deploy shares, so a phone subscribed on one deploy works on all.
 * Two first calls at once keep only one pair (`onlyIfNew`).
 */
export async function vapidKeys(store: KeyStore, env: Record<string, string | undefined> = process.env): Promise<Keys> {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const kept = (await store.get('vapid', { type: 'json' })) as Keys | null;
  if (kept?.publicKey && kept.privateKey) return kept;
  await store.setJSON('vapid', webpush.generateVAPIDKeys(), { onlyIfNew: true });
  return (await store.get('vapid', { type: 'json' })) as Keys;
}

/** Send a timer's push. A phone that has since unsubscribed (404, 410) just doesn't get it. */
export async function sendTimer(t: TimerPush, keys: Keys, subject: string, send = webpush.sendNotification): Promise<'sent' | 'unsubscribed'> {
  const message: PushMessage = { title: t.title, body: t.body, tag: t.id };
  try {
    await send(t.target, JSON.stringify(message), {
      vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
      // a timer's push is no use an hour late; delivered at once if the phone can be reached
      TTL: 60 * 60,
      urgency: 'high',
    });
    return 'sent';
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return 'unsubscribed';
    throw e;
  }
}
