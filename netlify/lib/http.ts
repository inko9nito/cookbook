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

/** The original cookbook's owner: every row from before #146, and every `admin` account. */
export const ADMIN_OWNER = '';

/** Whose cookbook a request works on (`owner`, the rows' owner_id), and whether it's the admin's. */
export type Account = { owner: string; admin: boolean };

/**
 * Who may get in (issue #146): a signed-in account with a role given in the Netlify UI (Identity → the user → Roles).
 * `admin`: the original cookbook, with everything (reading recipes with Claude, importing from Prepear). `user`: a
 * cookbook of its own, kept under its Identity id, without the things that use Claude. Nobody can give themselves a
 * role, so a Google account that signs up while registration is accidentally left open still gets nothing.
 * Returns the account, or the Response to send back when the caller isn't allowed (or Identity couldn't check).
 */
export async function accountFrom(req: Request, fetchImpl?: typeof fetch): Promise<Account | Response> {
  const user = await userFromRequest(req, fetchImpl);
  if (user === UNAVAILABLE) return error(503, 'Couldn’t check your sign-in just now. Try again in a moment.');
  if (!user) return error(401, 'Sign in to open your cookbook.');
  const roles = user.app_metadata?.roles ?? [];
  if (roles.includes('admin')) return { owner: ADMIN_OWNER, admin: true };
  if (roles.includes('user') && user.id) return { owner: user.id, admin: false };
  return error(403, 'This account doesn’t have a cookbook yet. Ask the person who shared the app to give it one.');
}

/** Only the admin: the things that use Claude (billed to the site) or the original cookbook's kept Prepear export. */
export async function refuseUnlessAdmin(req: Request, fetchImpl?: typeof fetch): Promise<Response | null> {
  const account = await accountFrom(req, fetchImpl);
  if (account instanceof Response) return account;
  return account.admin ? null : error(403, 'Only the cookbook’s owner can do that.');
}

/** Production is the only deploy that deletes stored photos: deploy previews share the photo store with it. */
export const isProduction = (context: Context) => context.deploy?.context === 'production';
