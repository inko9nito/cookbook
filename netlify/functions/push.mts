// /api/push (issue #169): cook mode timers' pushes. GET /api/push/key gives the server's public key, which the phone
// subscribes with. PUT /api/push/timers/:id holds a running timer's push and starts the background function that sends
// it when the timer is up (push-timer-background.mts); DELETE takes it back when the timer is stopped. Each account's own.

import type { Config, Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { ZodError } from 'zod';
import { BadTime, cancelTimer, saveTimer, vapidKeys } from '../lib/push';
import { accountFrom, error, json } from '../lib/http';
import { NotYours } from '../lib/recipes';

export default async (req: Request, context: Context) => {
  const account = await accountFrom(req);
  if (account instanceof Response) return account;
  const { owner } = account;
  const id = context.params.id;

  try {
    if (req.method === 'GET' && new URL(req.url).pathname === '/api/push/key') {
      const { publicKey } = await vapidKeys(getStore({ name: 'push', consistency: 'strong' }));
      return json({ publicKey });
    }

    if (!id) return error(405, 'Not allowed.');
    const { sql } = getDatabase();

    if (req.method === 'PUT') {
      const body = await req.json();
      if (body?.id !== id) return error(400, 'The id doesn’t match the address.');
      await saveTimer(sql, owner, body);
      // a background function answers 202 at once and waits for the timer (it needs no sign-in: it only ever sends a
      // held timer's push, at its time)
      const started = await fetch(new URL('/.netlify/functions/push-timer-background', req.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      }).catch(() => null);
      if (!started || started.status !== 202) {
        await cancelTimer(sql, owner, id);
        return error(502, 'The timer’s notification couldn’t be set up.');
      }
      return new Response(null, { status: 204 });
    }

    if (req.method === 'DELETE') {
      await cancelTimer(sql, owner, id);
      return new Response(null, { status: 204 });
    }

    return error(405, 'Not allowed.');
  } catch (e) {
    if (e instanceof ZodError) return error(400, `That isn’t valid: ${e.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    if (e instanceof SyntaxError) return error(400, 'The request isn’t valid JSON.');
    if (e instanceof BadTime) return error(400, e.message);
    if (e instanceof NotYours) return error(409, e.message);
    throw e;
  }
};

export const config: Config = { path: ['/api/push/key', '/api/push/timers/:id'] };
