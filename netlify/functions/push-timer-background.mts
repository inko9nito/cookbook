// Waits for one cook mode timer and sends its push when it's up (issue #169; netlify/lib/push.ts runTimer). A
// background function (the -background name): Netlify answers 202 at once and lets it run for up to 15 minutes, so a
// longer timer is handed on to the next one every 13 minutes. Started by push.mts when the phone starts a timer.
//
// No sign-in: it's started again by itself, without the phone. It's harmless to start: it only ever sends a timer's
// push that's held in the database, at the timer's own time, and only once (takeTimer).

import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { runTimer, sendTimer, vapidKeys } from '../lib/push';

export default async (req: Request) => {
  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof id !== 'string' || !/^[\w-]{8,64}$/.test(id)) return;
  const { sql } = getDatabase();
  const self = new URL('/.netlify/functions/push-timer-background', req.url);
  const subject = process.env.VAPID_SUBJECT ?? process.env.URL ?? 'https://cookbk.netlify.app';

  const outcome = await runTimer(
    {
      sql,
      now: Date.now,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      relay: async (timer) => {
        // try twice: if this fails, the timer still rings in the app, but there's no push
        for (let i = 0; i < 2; i++) {
          const res = await fetch(self, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: timer }) }).catch(() => null);
          if (res?.status === 202) return;
        }
        console.error(`Timer ${timer}: couldn’t start the next wait.`);
      },
      send: async (t) => {
        const result = await sendTimer(t, await vapidKeys(getStore({ name: 'push', consistency: 'strong' })), subject);
        if (result === 'unsubscribed') console.log(`Timer ${t.id}: that phone no longer takes notifications.`);
      },
    },
    id,
  );
  console.log(`Timer ${id}: ${outcome}.`);
};
