// Daily clean-up of stored photos: deletes the ones no recipe has used for 30 days (netlify/lib/photo-cleanup.ts).
// Saving a recipe no longer deletes photos straight away, which broke every copy still pointing at the old photo.
// Scheduled functions only run on the published (production) deploy, whose database is the real one; deploy previews
// share the photo store but have their own copy of the database, so they must never decide what's unused.

import type { Config, Context } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import { listRecipes } from '../lib/recipes';
import { cleanUpPhotos } from '../lib/photo-cleanup';

export default async (_req: Request, context: Context) => {
  if (context.deploy?.context && context.deploy.context !== 'production') return new Response('Not the production deploy.');
  const { sql } = getDatabase();
  const result = await cleanUpPhotos(await listRecipes(sql), getStore('photos'), getStore('photo-cleanup'));
  const summary = result.skipped
    ? 'Photo clean-up skipped: no recipes found.'
    : `Photo clean-up: deleted ${result.removed.length}, ${result.waiting} unused and waiting out their 30 days.`;
  console.log(summary);
  return new Response(summary);
};

export const config: Config = { schedule: '@daily' };
