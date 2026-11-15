// /api/photos: store a recipe photo in Netlify Blobs (POST, the image as the body) and serve it (GET /api/photos/:key).
// The app crops and shrinks photos on the phone before uploading (src/components/ui/photo.ts), so they're stored as sent.
// A photo is never changed after upload (a new crop is a new photo), so it can be cached for good.

import type { Config, Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { photoUrl } from '../lib/recipes';
import { error, json, refuseUnlessAdmin } from '../lib/http';

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 12 * 1024 * 1024;

export default async (req: Request, context: Context) => {
  const refused = await refuseUnlessAdmin();
  if (refused) return refused;
  const photos = getStore('photos');
  const key = context.params.key;

  if (req.method === 'POST' && !key) {
    const type = (req.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!TYPES[type]) return error(415, 'Photos must be JPEG, PNG or WebP.');
    const body = await req.arrayBuffer();
    if (!body.byteLength) return error(400, 'The photo is empty.');
    if (body.byteLength > MAX_BYTES) return error(413, 'That photo is too large.');
    const newKey = `${crypto.randomUUID()}.${TYPES[type]}`;
    await photos.set(newKey, body, { metadata: { type } });
    return json({ key: newKey, url: photoUrl(newKey) }, 201);
  }

  if (req.method === 'GET' && key) {
    const entry = await photos.getWithMetadata(key, { type: 'arrayBuffer' });
    if (entry === null) return error(404, 'No such photo.');
    const type = typeof entry.metadata.type === 'string' ? entry.metadata.type : 'image/jpeg';
    return new Response(entry.data, {
      headers: { 'content-type': type, 'cache-control': 'private, max-age=31536000, immutable' },
    });
  }

  return error(405, 'Not allowed.');
};

export const config: Config = { path: ['/api/photos', '/api/photos/:key'] };
