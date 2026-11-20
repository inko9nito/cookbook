// /api/planner (issue #62): list every planned recipe (GET), plan one or move it to another day
// (PUT /api/planner/:id), take one off its day (DELETE /api/planner/:id). Each account's own (issue #146).

import type { Config, Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { ZodError } from 'zod';
import { deletePlanned, listPlanned, savePlanned, UnknownRecipe } from '../lib/planner';
import { accountFrom, error, json } from '../lib/http';
import { NotYours } from '../lib/recipes';

export default async (req: Request, context: Context) => {
  const account = await accountFrom(req);
  if (account instanceof Response) return account;
  const { owner } = account;
  const { sql } = getDatabase();
  const id = context.params.id;

  try {
    if (req.method === 'GET' && !id) return json(await listPlanned(sql, owner));

    if (req.method === 'PUT' && id) {
      const body = await req.json();
      if (body?.id !== id) return error(400, 'The id doesn’t match the address.');
      return json(await savePlanned(sql, owner, body));
    }

    if (req.method === 'DELETE' && id) {
      await deletePlanned(sql, owner, id);
      return new Response(null, { status: 204 });
    }

    return error(405, 'Not allowed.');
  } catch (e) {
    if (e instanceof ZodError) return error(400, `That isn’t valid: ${e.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    if (e instanceof SyntaxError) return error(400, 'The request isn’t valid JSON.');
    if (e instanceof UnknownRecipe || e instanceof NotYours) return error(409, e.message);
    throw e;
  }
};

export const config: Config = { path: ['/api/planner', '/api/planner/:id'] };
