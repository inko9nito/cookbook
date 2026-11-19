// /api/groceries (issue #64): list everything on the grocery list (GET), or change it (POST { save, remove }: items to
// save, new or changed, and ids to take off, in one go). Admin only.

import type { Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { ZodError } from 'zod';
import { changeGroceries, listGroceries } from '../lib/groceries';
import { error, json, refuseUnlessAdmin } from '../lib/http';

export default async (req: Request) => {
  const refused = await refuseUnlessAdmin(req);
  if (refused) return refused;
  const db = getDatabase();

  try {
    if (req.method === 'GET') return json(await listGroceries(db));
    if (req.method === 'POST') {
      await changeGroceries(db, await req.json());
      return new Response(null, { status: 204 });
    }
    return error(405, 'Not allowed.');
  } catch (e) {
    if (e instanceof ZodError) return error(400, `That isn’t valid: ${e.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    if (e instanceof SyntaxError) return error(400, 'The request isn’t valid JSON.');
    throw e;
  }
};

export const config: Config = { path: '/api/groceries' };
