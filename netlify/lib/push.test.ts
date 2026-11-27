import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { NetlifyDB } from '@netlify/database-dev';
import { getDatabase } from '@netlify/database';
import { BadTime, cancelTimer, HOP_MS, runTimer, saveTimer, sendTimer, takeTimer, timerOf, vapidKeys, type Waiting } from './push';
import { NotYours } from './recipes';
import { isPushEndpoint, timerWords, type TimerPush } from '../../src/lib/push';

// Runs the real migrations on a local Postgres, then the same queries the API function uses.
let local: NetlifyDB;
let db: ReturnType<typeof getDatabase>;

beforeAll(async () => {
  local = new NetlifyDB();
  const connectionString = await local.start();
  await local.applyMigrations('./netlify/database/migrations');
  db = getDatabase({ connectionString });
}, 60_000);

afterAll(async () => {
  await db?.pool.end();
  await local?.stop();
});

const target = { endpoint: 'https://web.push.apple.com/QGhvbGEtc29tZQ', keys: { p256dh: 'BAbc', auth: 'xyz' } };
const timer = (id: string, endsAt: number): TimerPush => ({ id, endsAt, title: 'Chicken soup', body: 'Step 3: the 10 min timer is up.', target });

describe('push endpoints', () => {
  test('only the browsers’ own push services', () => {
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://wns2-by3p.notify.windows.com/w/?token=abc')).toBe(true);
    expect(isPushEndpoint('http://web.push.apple.com/abc')).toBe(false);
    expect(isPushEndpoint('https://web.push.apple.com:8443/abc')).toBe(false);
    expect(isPushEndpoint('https://web.push.apple.com.evil.example/abc')).toBe(false);
    expect(isPushEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(isPushEndpoint('not a url')).toBe(false);
  });

  test('the words: the recipe, then the step and its timer', () => {
    expect(timerWords('Chicken soup', 3, '10 min')).toEqual({ title: 'Chicken soup', body: 'Step 3: the 10 min timer is up.' });
    expect(timerWords('', 1, '5 min').title).toBe('Recipe');
  });
});

describe('timers in the database', () => {
  test('held, read back, taken once', async () => {
    const now = Date.now();
    await saveTimer(db.sql, '', timer('timer-0001', now + 60_000), now);
    expect(await timerOf(db.sql, 'timer-0001')).toEqual(timer('timer-0001', now + 60_000));
    expect(await takeTimer(db.sql, 'timer-0001')).toEqual(timer('timer-0001', now + 60_000));
    expect(await takeTimer(db.sql, 'timer-0001')).toBeNull();
  });

  test('stopping it on the phone takes it back; another account can’t touch it', async () => {
    const now = Date.now();
    await saveTimer(db.sql, '', timer('timer-0002', now + 60_000), now);
    await expect(saveTimer(db.sql, 'someone', timer('timer-0002', now + 1000), now)).rejects.toBeInstanceOf(NotYours);
    await cancelTimer(db.sql, 'someone', 'timer-0002');
    expect((await timerOf(db.sql, 'timer-0002'))?.endsAt).toBe(now + 60_000);
    await cancelTimer(db.sql, '', 'timer-0002');
    expect(await timerOf(db.sql, 'timer-0002')).toBeNull();
  });

  test('refused: a time long gone or more than a day off, and an address that isn’t a push service', async () => {
    const now = Date.now();
    await expect(saveTimer(db.sql, '', timer('timer-0003', now - 5 * 60_000), now)).rejects.toBeInstanceOf(BadTime);
    await expect(saveTimer(db.sql, '', timer('timer-0003', now + 25 * 3600_000), now)).rejects.toBeInstanceOf(BadTime);
    await expect(saveTimer(db.sql, '', { ...timer('timer-0003', now + 1000), target: { ...target, endpoint: 'https://example.com/x' } }, now)).rejects.toThrow();
    expect(await timerOf(db.sql, 'timer-0003')).toBeNull();
  });
});

describe('waiting for a timer', () => {
  const waiting = (start: number) => {
    let clock = start;
    const log: string[] = [];
    const w: Waiting = {
      sql: db.sql,
      now: () => clock,
      sleep: async (ms) => {
        log.push(`sleep ${ms}`);
        clock += ms;
      },
      relay: async (id) => void log.push(`relay ${id}`),
      send: async (t) => void log.push(`send ${t.id}`),
    };
    return { w, log };
  };

  test('waits until it’s up, then sends it once', async () => {
    const now = Date.now();
    await saveTimer(db.sql, '', timer('timer-0010', now + 90_000), now);
    const { w, log } = waiting(now);
    expect(await runTimer(w, 'timer-0010')).toBe('sent');
    expect(log).toEqual(['sleep 90000', 'send timer-0010']);
    // a second wait for the same timer (the phone set it up again after a reload) sends nothing
    expect(await runTimer(w, 'timer-0010')).toBe('gone');
  });

  test('a long timer is handed on every 13 minutes', async () => {
    const now = Date.now();
    await saveTimer(db.sql, '', timer('timer-0011', now + 40 * 60_000), now);
    const { w, log } = waiting(now);
    expect(await runTimer(w, 'timer-0011')).toBe('relayed');
    expect(log).toEqual([`sleep ${HOP_MS}`, 'relay timer-0011']);
    await cancelTimer(db.sql, '', 'timer-0011');
  });

  test('a timer stopped meanwhile sends nothing', async () => {
    const now = Date.now();
    await saveTimer(db.sql, '', timer('timer-0012', now + 60_000), now);
    const { w, log } = waiting(now);
    w.sleep = async () => void (await cancelTimer(db.sql, '', 'timer-0012'));
    expect(await runTimer(w, 'timer-0012')).toBe('gone');
    expect(log).toEqual([]);
  });
});

describe('sending', () => {
  const keys = { publicKey: 'pub', privateKey: 'priv' };

  test('the push carries the words, and goes to the phone’s subscription', async () => {
    const sent: unknown[] = [];
    const result = await sendTimer(timer('timer-0020', 0), keys, 'https://cookbk.netlify.app', (async (...args: unknown[]) => {
      sent.push(args);
      return { statusCode: 201, body: '', headers: {} };
    }) as never);
    expect(result).toBe('sent');
    const [to, payload, opts] = sent[0] as [unknown, string, { vapidDetails: unknown; urgency: string }];
    expect(to).toEqual(target);
    expect(JSON.parse(payload)).toEqual({ title: 'Chicken soup', body: 'Step 3: the 10 min timer is up.', tag: 'timer-0020' });
    expect(opts.vapidDetails).toEqual({ subject: 'https://cookbk.netlify.app', publicKey: 'pub', privateKey: 'priv' });
    expect(opts.urgency).toBe('high');
  });

  test('a phone that unsubscribed isn’t an error', async () => {
    const gone = (async () => Promise.reject(Object.assign(new Error('Gone'), { statusCode: 410 }))) as never;
    expect(await sendTimer(timer('timer-0021', 0), keys, 's', gone)).toBe('unsubscribed');
    const down = (async () => Promise.reject(Object.assign(new Error('Down'), { statusCode: 500 }))) as never;
    await expect(sendTimer(timer('timer-0021', 0), keys, 's', down)).rejects.toThrow('Down');
  });

  test('the keys: from the environment, else made once and kept', async () => {
    expect(await vapidKeys({} as never, { VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b' })).toEqual({ publicKey: 'a', privateKey: 'b' });
    const kept = new Map<string, unknown>();
    const store = {
      get: async (k: string) => kept.get(k) ?? null,
      setJSON: async (k: string, v: unknown, o: { onlyIfNew: boolean }) => void (o.onlyIfNew && kept.has(k) ? null : kept.set(k, v)),
    };
    const first = await vapidKeys(store, {});
    expect(first.publicKey).toMatch(/^[\w-]{80,}$/);
    expect(await vapidKeys(store, {})).toEqual(first);
  });
});
