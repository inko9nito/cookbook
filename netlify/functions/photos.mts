// /api/photos: store a recipe photo in Netlify Blobs (POST, the image as the body) and serve it (GET /api/photos/:key).
// The app crops and shrinks photos on the phone before uploading (src/components/ui/photo.ts), so they're stored as sent.
// A photo is never changed after upload (a new crop is a new photo), so it can be cached for good.
// Issue #14: POST with JSON { prepear: "/prepear-prod/…/….jpg" } copies a photo from Prepear's photo host (ImageKit)
// instead; the server fetches it, so the phone doesn't download and upload 300 photos. Only Prepear's host is asked.
// Reading one needs no sign-in: the page shows photos with plain <img> and background images, which can't carry the
// sign-in header, and each photo's address is a random UUID nobody can guess. Storing one needs a role (issue #146:
// admin or user); copying one from Prepear only the admin (importing from Prepear is the admin's).

import type { Config, Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { photoUrl } from '../lib/recipes';
import { accountFrom, error, json } from '../lib/http';
import { prepearPhotoUrls } from '../lib/prepear-photos';

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 12 * 1024 * 1024;

export default async (req: Request, context: Context) => {
  const photos = getStore('photos');
  const key = context.params.key;

  if (req.method === 'POST' && !key) {
    const account = await accountFrom(req);
    if (account instanceof Response) return account;
    let type = (req.headers.get('content-type') ?? '').split(';')[0].trim();
    let body: ArrayBuffer;
    if (type === 'application/json') {
      if (!account.admin) return error(403, 'Only the cookbook’s owner can do that.');
      const urls = prepearPhotoUrls((await req.json().catch(() => null))?.prepear);
      if (!urls) return error(400, 'That isn’t a Prepear photo.');
      const copied = await fetchFirst(urls);
      if (!copied) return error(502, 'Prepear’s photo host didn’t send that photo.');
      ({ type, body } = copied);
    } else body = await req.arrayBuffer();
    if (!TYPES[type]) return error(415, 'Photos must be JPEG, PNG or WebP.');
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
      headers: { 'content-type': type, 'cache-control': 'public, max-age=31536000, immutable' },
    });
  }

  return error(405, 'Not allowed.');
};

/** The first of these addresses that answers with a photo. */
async function fetchFirst(urls: string[]): Promise<{ type: string; body: ArrayBuffer } | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      // a redirect may only stay on ImageKit
      if (new URL(res.url || url).hostname !== 'ik.imagekit.io') continue;
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
      if (res.ok && TYPES[type]) return { type, body: await res.arrayBuffer() };
    } catch {
      /* try the next one */
    }
  }
  return null;
}

export const config: Config = { path: ['/api/photos', '/api/photos/:key'] };
