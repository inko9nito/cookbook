// Reads the photos of one /api/read-recipe job with Claude (issue #17) and keeps the result for the phone to fetch.
// A background function (the -background name): Netlify answers 202 at once and lets it run for up to 15 minutes,
// since reading can take longer than an ordinary function's 30 seconds. Started by read-recipe.mts with the
// caller's sign-in, which it checks again.

import { getStore } from '@netlify/blobs';
import { runJob } from '../lib/read-recipe';
import { refuseUnlessAdmin } from '../lib/http';

export default async (req: Request) => {
  if (await refuseUnlessAdmin(req)) return;
  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id)) return;
  await runJob(getStore({ name: 'reads', consistency: 'strong' }), id);
};
