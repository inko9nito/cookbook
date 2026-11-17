// /api/read-recipe: read a recipe from photos or screenshots (issue #17). POST { images: [{ data, width, height }] }
// (JPEG data URLs, shrunk on the phone) → the recipe as written (src/lib/read-recipe.ts). Nothing is stored: the editor
// fills in the new recipe, and it's saved as usual. Admin only, since every read is billed to the Netlify account.

import type { Config } from '@netlify/functions';
import { ReadRequest } from '../../src/lib/read-recipe';
import { ReadError, readRecipe } from '../lib/read-recipe';
import { error, json, refuseUnlessAdmin } from '../lib/http';

export default async (req: Request) => {
  const refused = await refuseUnlessAdmin(req);
  if (refused) return refused;
  if (req.method !== 'POST') return error(405, 'Not allowed.');

  let body: ReadRequest;
  try {
    body = ReadRequest.parse(await req.json());
  } catch {
    return error(400, 'Send one to four photos to read.');
  }
  try {
    return json(await readRecipe(body));
  } catch (e) {
    if (e instanceof ReadError) return error(e.status, e.message);
    throw e;
  }
};

export const config: Config = { path: '/api/read-recipe' };
