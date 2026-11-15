// /api/settings: read the app settings (GET) or change some of them (PATCH).

import type { Config } from '@netlify/functions';
import { getDatabase } from '@netlify/database';
import { ZodError } from 'zod';
import { getSettings, saveSettings } from '../lib/recipes';
import { error, json, refuseUnlessOwner } from '../lib/http';

export default async (req: Request) => {
  const refused = await refuseUnlessOwner();
  if (refused) return refused;
  const { sql } = getDatabase();
  try {
    if (req.method === 'GET') return json(await getSettings(sql));
    if (req.method === 'PATCH') return json(await saveSettings(sql, await req.json()));
    return error(405, 'Not allowed.');
  } catch (e) {
    if (e instanceof ZodError || e instanceof SyntaxError) return error(400, 'Those settings aren’t valid.');
    throw e;
  }
};

export const config: Config = { path: '/api/settings' };
