// /api/cookbooks (issue #25): list every cookbook (GET), save one whole (PUT /api/cookbooks/:id), delete one
// (DELETE /api/cookbooks/:id). Each account's own (issue #146).

import type { Config, Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { ZodError } from 'zod';
import { deleteCookbook, DuplicatePrepearCookbook, listCookbooks, saveCookbook } from '../lib/cookbooks';
import { accountFrom, error, json } from '../lib/http';
import { NotYours } from '../lib/recipes';

export default async (req: Request, context: Context) => {
  const account = await accountFrom(req);
  if (account instanceof Response) return account;
  const { owner } = account;
  const db = getDatabase();
  const id = context.params.id;

  try {
    if (req.method === 'GET' && !id) return json(await listCookbooks(db, owner));

    if (req.method === 'PUT' && id) {
      const body = await req.json();
      if (body?.id !== id) return error(400, 'The cookbook id doesn’t match the address.');
      return json(await saveCookbook(db, owner, body));
    }

    if (req.method === 'DELETE' && id) {
      await deleteCookbook(db, owner, id);
      return new Response(null, { status: 204 });
    }

    return error(405, 'Not allowed.');
  } catch (e) {
    if (e instanceof ZodError) return error(400, `The cookbook isn’t valid: ${e.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    if (e instanceof SyntaxError) return error(400, 'The request isn’t valid JSON.');
    if (e instanceof DuplicatePrepearCookbook || e instanceof NotYours) return error(409, e.message);
    throw e;
  }
};

export const config: Config = { path: ['/api/cookbooks', '/api/cookbooks/:id'] };
