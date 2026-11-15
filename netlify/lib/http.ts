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
 * Only an admin gets in. Netlify Identity (Google sign-in, invite-only) proves who's calling, and the `admin` role says
 * they may: roles are given in the Netlify UI (Identity → the user → Roles) and ride in the signed sign-in token, so
 * nobody can give themselves one. A Google account that signs up while registration is accidentally left open has no
 * role, so it still can't see the recipes.
 * Returns a Response to send back when the caller isn't allowed, or null when they are.
 */
export async function refuseUnlessAdmin(): Promise<Response | null> {
  const user = await getUser();
  if (!user) return error(401, 'Sign in to open your cookbook.');
  if (!user.roles?.includes('admin')) return error(403, 'This account isn’t an admin of this cookbook.');
  return null;
}

/** Production is the only deploy that deletes stored photos: deploy previews share the photo store with it. */
export const isProduction = (context: Context) => context.deploy?.context === 'production';
