// Shared by the API functions: who may call them, and JSON responses.

import type { Context } from '@netlify/functions';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export const error = (status: number, message: string) => json({ error: message }, status);

type IdentityUser = { id: string; email: string; app_metadata?: { roles?: string[] } };

/** Identity couldn't say whose the token is (it's down, or busy): try again, the sign-in is fine (#114). */
export const UNAVAILABLE = 'unavailable';

/**
 * Who sent the request: the app sends the sign-in as `Authorization: Bearer <token>` (src/data/identity.ts), and
 * Netlify Identity says whose it is (the same check as the HPDE app). Identity validates the token, so a forged or
 * expired one gets null. Roles come back fresh, so a role given in the Netlify UI counts at once.
 * When Identity can't answer (no connection to it, or it fails), that's UNAVAILABLE, not null: answering "signed
 * out" then made the app throw away a sign-in that was fine (#114).
 */
export async function userFromRequest(req: Request, fetchImpl: typeof fetch = fetch): Promise<IdentityUser | null | typeof UNAVAILABLE> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const res = await fetchImpl(new URL('/.netlify/identity/user', req.url), { headers: { authorization: auth } });
    if (res.ok) return (await res.json()) as IdentityUser;
    return [400, 401, 403, 404].includes(res.status) ? null : UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }
}

/**
 * Only an admin gets in: a signed-in account with the `admin` role, given in the Netlify UI (Identity → the user →
 * Roles). Nobody can give themselves one, so a Google account that signs up while registration is accidentally left
 * open still can't see the recipes.
 * Returns a Response to send back when the caller isn't allowed (or Identity couldn't check), or null when they are.
 */
export async function refuseUnlessAdmin(req: Request, fetchImpl?: typeof fetch): Promise<Response | null> {
  const user = await userFromRequest(req, fetchImpl);
  if (user === UNAVAILABLE) return error(503, 'Couldn’t check your sign-in just now. Try again in a moment.');
  if (!user) return error(401, 'Sign in to open your cookbook.');
  if (!user.app_metadata?.roles?.includes('admin')) return error(403, 'This account isn’t an admin of this cookbook.');
  return null;
}

/** Production is the only deploy that deletes stored photos: deploy previews share the photo store with it. */
export const isProduction = (context: Context) => context.deploy?.context === 'production';
