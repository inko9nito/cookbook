// /api/grocery-names (issue #64): what each ingredient is on the grocery list (src/lib/grocery-names.ts).
// GET → every name known so far. POST { names } (at most 60) → those names, the ones not known yet named by Claude now
// and kept; if Claude can't be asked, the known ones and { error } (the app uses its rules for the rest).
// POST { backfill: names } → starts grocery-names-background.mts, which names a whole library in batches, unless one
// is already running → 202. PUT { key, things } → a correction from the phone, which Claude never overwrites.
// Admin only: naming is billed to Netlify.

import type { Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { z, ZodError } from 'zod';
import { NamingError, correctName, listNames, nameIngredients, BATCH } from '../lib/grocery-names';
import { error, json, refuseUnlessAdmin } from '../lib/http';

const Names = z.object({ names: z.array(z.string().max(200)).min(1).max(BATCH) });
const Backfill = z.object({ backfill: z.array(z.string().max(200)).min(1).max(5000) });

/** A backfill marks itself running here; one started less than this long ago is left to finish. */
const BACKFILL_LIMIT_MS = 15 * 60_000;

export default async (req: Request) => {
  const refused = await refuseUnlessAdmin(req);
  if (refused) return refused;
  const { sql } = getDatabase();

  try {
    if (req.method === 'GET') return json(await listNames(sql));
    if (req.method === 'PUT') return json(await correctName(sql, await req.json()));
    if (req.method === 'POST') {
      const body: unknown = await req.json();
      const backfill = Backfill.safeParse(body);
      if (backfill.success) {
        const jobs = getStore({ name: 'grocery-names', consistency: 'strong' });
        const running = (await jobs.get('backfill', { type: 'json' }).catch(() => null)) as { at?: number } | null;
        if (running?.at && Date.now() - running.at < BACKFILL_LIMIT_MS) return json({ running: true }, 202);
        await jobs.setJSON('backfill', { at: Date.now() });
        const started = await fetch(new URL('/.netlify/functions/grocery-names-background', req.url), {
          method: 'POST',
          headers: { authorization: req.headers.get('authorization') ?? '', 'content-type': 'application/json' },
          body: JSON.stringify({ names: backfill.data.backfill }),
        }).catch(() => null);
        if (!started || started.status !== 202) {
          await jobs.delete('backfill');
          return error(502, 'Naming the groceries couldn’t be started.');
        }
        return json({ started: true }, 202);
      }
      const { names } = Names.parse(body);
      try {
        return json({ names: await nameIngredients(sql, names) });
      } catch (e) {
        if (!(e instanceof NamingError)) throw e;
        // what's known, and why the rest isn't: the app uses its rules for those and asks again later
        const known = await nameIngredients(sql, names, async () => []);
        return json({ names: known, error: e.message });
      }
    }
    return error(405, 'Not allowed.');
  } catch (e) {
    if (e instanceof ZodError) return error(400, `That isn’t valid: ${e.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    if (e instanceof SyntaxError) return error(400, 'The request isn’t valid JSON.');
    throw e;
  }
};

export const config: Config = { path: '/api/grocery-names' };
