// /api/recipes: list every recipe (GET), save one (PUT /api/recipes/:id), delete one (DELETE /api/recipes/:id).

import type { Config, Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { ZodError } from 'zod';
import { deleteRecipe, listRecipes, NotYours, saveRecipe } from '../lib/recipes';
import { accountFrom, error, json } from '../lib/http';

export default async (req: Request, context: Context) => {
  const account = await accountFrom(req);
  if (account instanceof Response) return account;
  const { owner } = account;
  const { sql } = getDatabase();
  const id = context.params.id;

  try {
    if (req.method === 'GET' && !id) return json(await listRecipes(sql, owner));

    if (req.method === 'PUT' && id) {
      const body = await req.json();
      if (body?.id !== id) return error(400, 'The recipe id doesn’t match the address.');
      // photos it stops using aren't deleted here: the daily clean-up does that a month later (photo-cleanup.mts)
      const { saved } = await saveRecipe(sql, owner, body);
      return json(saved);
    }

    if (req.method === 'DELETE' && id) {
      await deleteRecipe(sql, owner, id); // its photos go with the daily clean-up, a month later
      return new Response(null, { status: 204 });
    }

    return error(405, 'Not allowed.');
  } catch (e) {
    if (e instanceof ZodError) return error(400, `The recipe isn’t valid: ${e.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    if (e instanceof SyntaxError) return error(400, 'The request isn’t valid JSON.');
    if (e instanceof NotYours) return error(409, e.message);
    throw e;
  }
};

export const config: Config = { path: ['/api/recipes', '/api/recipes/:id'] };
