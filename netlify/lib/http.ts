// Shared by the API functions: who may call them, and JSON responses.

import { getUser } from '@netlify/identity';
import type { Context } from '@netlify/functions';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export const error = (status: number, message: string) => json({ error: message }, status);

/**
 * Only the cookbook's owner gets in. Netlify Identity (Google sign-in, invite-only) proves who's calling; the
 * OWNER_EMAIL environment variable (set in the Netlify UI, comma-separated for more than one) says who that may be.
 * Without OWNER_EMAIL nobody gets in, so a sign-up setting left open can't expose the recipes.
 * Returns a Response to send back when the caller isn't allowed, or null when they are.
 */
export async function refuseUnlessOwner(): Promise<Response | null> {
  const user = await getUser();
  if (!user?.email) return error(401, 'Sign in to open your cookbook.');
  const owners = (Netlify.env.get('OWNER_EMAIL') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!owners.length) return error(503, 'The cookbook has no owner yet: set OWNER_EMAIL in the Netlify site settings.');
  if (!owners.includes(user.email.toLowerCase())) return error(403, 'This account can’t open this cookbook.');
  return null;
}

/** Production is the only deploy that deletes stored photos: deploy previews share the photo store with it. */
export const isProduction = (context: Context) => context.deploy?.context === 'production';
