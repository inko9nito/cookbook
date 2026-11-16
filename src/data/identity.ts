// Signing in with Netlify Identity, the same way as the HPDE app: gotrue-js (what Netlify's Identity widget is built on).
//
// - The sign-in is kept in localStorage ("gotrue.user") only. No cookies: iOS drops those when it closes the
//   home-screen app, which signed you out after a few minutes away.
// - Every API call carries the access token as `Authorization: Bearer …`; the API asks Identity who it belongs to.
// - The token lasts an hour and is renewed with a refresh token that works once (see adoptSavedToken), when a call
//   needs it and whenever the app comes back to the front.
// - A renewal that fails because there's no connection doesn't sign you out (gotrue-js would): the kitchen may be
//   offline, and the recipes are cached.

import GoTrue, { type User } from 'gotrue-js';

const IDENTITY_PATH = '/.netlify/identity';
export const SESSION_KEY = 'gotrue.user';

let client: GoTrue | null = null;
const auth = () => (client ??= new GoTrue({ APIUrl: `${location.origin}${IDENTITY_PATH}`, setCookie: false }));

/** The signed-in user saved on this phone, or null. */
export const currentUser = (): User | null => {
  try {
    return auth().currentUser();
  } catch {
    return null;
  }
};

/** The renewal was refused (the sign-in was revoked or has lapsed): signed out. */
export class SignedOutError extends Error {
  constructor() {
    super('Signed out');
    this.name = 'SignedOutError';
  }
}

/**
 * Bring this page's copy of the sign-in up to date with the one saved on the phone before renewing it. A refresh token
 * works once: if another copy of the app (a second tab, or this page before a reload) renewed since this page read it,
 * this page's refresh token is spent, renewing with it fails, and gotrue-js clears the sign-in everywhere.
 */
export function adoptSavedToken(user: User, storage: Pick<Storage, 'getItem'> = localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(SESSION_KEY) ?? 'null') as { id?: string; token?: User['token'] } | null;
    const token = saved?.token;
    if (saved?.id !== user.id || !token?.refresh_token || !token.access_token) return;
    if (token.refresh_token === user.token?.refresh_token) return;
    if ((token.expires_at ?? 0) < (user.token?.expires_at ?? 0)) return;
    user.token = token;
  } catch {
    // unreadable storage: renew with what this page has
  }
}

/** Identity said no (as opposed to the connection failing). */
const refused = (e: unknown) => typeof e === 'object' && e !== null && 'status' in e && [400, 401, 403].includes(Number(e.status));

/**
 * The access token, renewed first when it's (nearly) expired. Null when signed out, or offline with an expired token.
 * Throws SignedOutError when Identity refuses the renewal.
 */
export async function accessToken(force = false): Promise<string | null> {
  const user = currentUser();
  if (!user) return null;
  adoptSavedToken(user);
  const saved = localStorage.getItem(SESSION_KEY);
  try {
    return await user.jwt(force);
  } catch (e) {
    if (refused(e)) throw new SignedOutError();
    // no connection: gotrue-js has cleared the sign-in anyway; put it back and try again later
    if (saved) localStorage.setItem(SESSION_KEY, saved);
    return null;
  }
}

/**
 * Off to Google (through Netlify Identity); it comes back to this page with the sign-in in the address. The trip
 * replaces this page in the history rather than adding to it, so iOS's back gesture can't return to the signed-out page.
 */
export function startGoogleSignIn(inviteToken?: string) {
  location.replace(inviteToken ? auth().acceptInviteExternalUrl('google', inviteToken) : auth().loginExternalUrl('google'));
}

/** What the address says when the page loads from a sign-in link: Google's answer, an invite, or an error. */
export type Arrival = { kind: 'token'; params: URLSearchParams } | { kind: 'invite'; token: string } | { kind: 'error'; message: string } | null;

export function readArrival(hash: string): Arrival {
  const params = new URLSearchParams(hash.replace(/^#\/?/, ''));
  if (params.get('access_token')) return { kind: 'token', params };
  if (params.get('invite_token')) return { kind: 'invite', token: params.get('invite_token')! };
  if (params.get('error')) return { kind: 'error', message: params.get('error_description')?.replace(/\+/g, ' ') ?? 'Signing in didn’t work.' };
  return null;
}

/** When an access token runs out (ms since 1970), read from the token itself; 0 when it can't be read. */
export function tokenExpiry(accessToken: string): number {
  try {
    const part = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const exp = Number(JSON.parse(atob(part)).exp);
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Whether the sign-in in the address is new enough to use. iOS's back gesture can reopen the address Google sent you
 * back to, long after: its token has run out and its refresh token was spent at the first renewal, so using it would
 * fail and clear the sign-in saved on the phone (gotrue-js does that when a renewal is refused). Only a token that
 * hasn't run out, and is newer than the saved one, counts.
 */
export function isFreshArrival(params: URLSearchParams, saved: Pick<User, 'token'> | null, now = Date.now()): boolean {
  const expires = tokenExpiry(params.get('access_token') ?? '');
  const margin = 60_000; // gotrue-js renews a token this close to running out, which a spent refresh token can't do
  return expires - margin > now && expires > (saved?.token?.expires_at ?? 0);
}

/** Back from Google: trade the token in the address for the user and keep the sign-in on the phone. */
export async function finishSignIn(params: URLSearchParams): Promise<User> {
  const expiresIn = Number(params.get('expires_in')) || 3600;
  return auth().createUser(
    {
      access_token: params.get('access_token')!,
      refresh_token: params.get('refresh_token') ?? '',
      token_type: 'bearer',
      expires_in: expiresIn,
      expires_at: Date.now() + expiresIn * 1000,
    },
    true,
  );
}

export async function signOut() {
  const user = currentUser();
  await user?.logout().catch(() => user.clearSession());
}
