// /api/grocery-names (issue #64): what each ingredient is on the grocery list (src/lib/grocery-names.ts).
// GET → every name known so far. POST { names } (at most 60) → those names, the ones not known yet named by Claude now
// and kept; if Claude can't be asked, the known ones and { error } (the app uses its rules for the rest).
// POST { backfill: names } → starts grocery-names-background.mts, which names a whole library in batches, unless one
// is already running → 202. PUT { key, things } → a correction from the phone, which Claude never overwrites.
// Each account's own names (issue #146). Only the admin's are named by Claude (billed to Netlify): another account
// gets its corrections back and the app's rules stand in for the rest; it can't start a backfill.

import type { Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { z, ZodError } from 'zod';
import { NamingError, correctName, listNames, nameIngredients, BATCH } from '../lib/grocery-names';
import { accountFrom, error, json } from '../lib/http';

const Names = z.object({ names: z.array(z.string().max(200)).min(1).max(BATCH) });
const Backfill = z.object({ backfill: z.array(z.string().max(200)).min(1).max(5000) });

/** A backfill marks itself running here; one started less than this long ago is left to finish. */
const BACKFILL_LIMIT_MS = 15 * 60_000;

export default async (req: Request) => {
  const account = await accountFrom(req);
  if (account instanceof Response) return account;
  const { owner } = account;
  // no Claude for an account that isn't the admin's: only what it has already (its corrections)
  const noClaude = async () => [];
  const { sql } = getDatabase();

  try {
    if (req.method === 'GET') return json(await listNames(sql, owner));
    if (req.method === 'PUT') return json(await correctName(sql, owner, await req.json()));
    if (req.method === 'POST') {
      const body: unknown = await req.json();
      const backfill = Backfill.safeParse(body);
      if (backfill.success) {
        if (!account.admin) return error(403, 'Only the cookbook’s owner can do that.');
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
        return json({ names: await nameIngredients(sql, owner, names, account.admin ? undefined : noClaude) });
      } catch (e) {
        if (!(e instanceof NamingError)) throw e;
        // what's known, and why the rest isn't: the app uses its rules for those and asks again later
        const known = await nameIngredients(sql, owner, names, noClaude);
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
