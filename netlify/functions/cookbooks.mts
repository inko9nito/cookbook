// /api/cookbooks (issue #25): list every cookbook (GET), save one whole (PUT /api/cookbooks/:id), delete one
// (DELETE /api/cookbooks/:id). Admin only.

import type { Config, Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { ZodError } from 'zod';
import { deleteCookbook, DuplicatePrepearCookbook, listCookbooks, saveCookbook } from '../lib/cookbooks';
import { error, json, refuseUnlessAdmin } from '../lib/http';

export default async (req: Request, context: Context) => {
  const refused = await refuseUnlessAdmin(req);
  if (refused) return refused;
  const db = getDatabase();
  const id = context.params.id;

  try {
    if (req.method === 'GET' && !id) return json(await listCookbooks(db));

    if (req.method === 'PUT' && id) {
      const body = await req.json();
      if (body?.id !== id) return error(400, 'The cookbook id doesn’t match the address.');
      return json(await saveCookbook(db, body));
    }

    if (req.method === 'DELETE' && id) {
      await deleteCookbook(db, id);
      return new Response(null, { status: 204 });
    }

    return error(405, 'Not allowed.');
  } catch (e) {
    if (e instanceof ZodError) return error(400, `The cookbook isn’t valid: ${e.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    if (e instanceof SyntaxError) return error(400, 'The request isn’t valid JSON.');
    if (e instanceof DuplicatePrepearCookbook) return error(409, e.message);
    throw e;
  }
};

export const config: Config = { path: ['/api/cookbooks', '/api/cookbooks/:id'] };
