// /api/imports/prepear: keep the Prepear export file (issue #14). The import page sends it before importing recipes, so
// Prepear's cookbooks and meal plan (which this app can't show yet) are kept for when those screens exist, without
// exporting from Prepear again. PUT stores it (dated, plus "latest"); GET returns the latest. Admin only.
// Kept in Netlify Blobs (store "imports"), which deploy previews share with production, like the photos.

import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { error, json, refuseUnlessAdmin } from '../lib/http';

const MAX_BYTES = 20 * 1024 * 1024;

export default async (req: Request) => {
  const refused = await refuseUnlessAdmin(req);
  if (refused) return refused;
  const imports = getStore('imports');

  if (req.method === 'PUT') {
    const text = await req.text();
    if (text.length > MAX_BYTES) return error(413, 'That file is too large.');
    let data: { format?: string; exportedAt?: string };
    try {
      data = JSON.parse(text);
    } catch {
      return error(400, 'That isn’t a Prepear export file.');
    }
    if (data?.format !== 'prepear-export') return error(400, 'That isn’t a Prepear export file.');
    const stamp = String(data.exportedAt ?? new Date().toISOString()).replace(/[^\w.-]/g, '-');
    await imports.set(`prepear/${stamp}.json`, text);
    await imports.set('prepear/latest.json', text);
    return json({ key: `prepear/${stamp}.json` }, 201);
  }

  if (req.method === 'GET') {
    const text = await imports.get('prepear/latest.json');
    if (text === null) return error(404, 'No Prepear export has been kept yet.');
    return new Response(text, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }

  return error(405, 'Not allowed.');
};

export const config: Config = { path: '/api/imports/prepear' };
