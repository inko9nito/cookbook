// /api/recipes: list every recipe (GET), save one (PUT /api/recipes/:id), delete one (DELETE /api/recipes/:id).

import type { Config, Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { ZodError } from 'zod';
import { deleteRecipe, listRecipes, photoKeys, saveRecipe } from '../lib/recipes';
import { error, isProduction, json, refuseUnlessAdmin } from '../lib/http';

/** Delete stored photos the recipe no longer uses (only on the production deploy; see isProduction). */
async function dropPhotos(keys: string[], context: Context) {
  if (!keys.length || !isProduction(context)) return;
  const photos = getStore('photos');
  await Promise.all(keys.map((k) => photos.delete(k).catch(() => undefined)));
}

export default async (req: Request, context: Context) => {
  const refused = await refuseUnlessAdmin();
  if (refused) return refused;
  const { sql } = getDatabase();
  const id = context.params.id;

  try {
    if (req.method === 'GET' && !id) return json(await listRecipes(sql));

    if (req.method === 'PUT' && id) {
      const body = await req.json();
      if (body?.id !== id) return error(400, 'The recipe id doesn’t match the address.');
      const { saved, previous } = await saveRecipe(sql, body);
      const kept = new Set(photoKeys(saved));
      await dropPhotos(photoKeys(previous).filter((k) => !kept.has(k)), context);
      return json(saved);
    }

    if (req.method === 'DELETE' && id) {
      const gone = await deleteRecipe(sql, id);
      await dropPhotos(photoKeys(gone), context);
      return new Response(null, { status: 204 });
    }

    return error(405, 'Not allowed.');
  } catch (e) {
    if (e instanceof ZodError) return error(400, `The recipe isn’t valid: ${e.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    if (e instanceof SyntaxError) return error(400, 'The request isn’t valid JSON.');
    throw e;
  }
};

export const config: Config = { path: ['/api/recipes', '/api/recipes/:id'] };
