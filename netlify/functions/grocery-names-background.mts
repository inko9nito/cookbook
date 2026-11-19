// Names a whole library's ingredients for the grocery list (issue #64), started by grocery-names.mts (POST
// { backfill }) the first time the Groceries tab finds names not named yet. A background function (the -background
// name): Netlify answers 202 at once and lets it run for up to 15 minutes, batch after batch. It checks the same
// sign-in, and clears its running mark when it's done (or fails), so a later visit can start another for what's left.

import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { nameIngredients } from '../lib/grocery-names';
import { refuseUnlessAdmin } from '../lib/http';

export default async (req: Request) => {
  if (await refuseUnlessAdmin(req)) return;
  const jobs = getStore({ name: 'grocery-names', consistency: 'strong' });
  try {
    const { names } = (await req.json().catch(() => ({}))) as { names?: unknown };
    if (!Array.isArray(names)) return;
    const list = names.filter((n): n is string => typeof n === 'string' && n.length <= 200).slice(0, 5000);
    await nameIngredients(getDatabase().sql, list);
  } catch (e) {
    console.error('Naming groceries stopped:', e instanceof Error ? e.message : e);
  } finally {
    await jobs.delete('backfill').catch(() => undefined);
  }
};
