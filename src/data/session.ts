// Staying signed in on the iPhone.
//
// Netlify Identity keeps the session in two places: localStorage ("gotrue.user", which lasts) and the nf_jwt / nf_refresh
// cookies the API reads. @netlify/identity writes those cookies without an expiry, so they're session cookies, and iOS
// drops session cookies when it closes the home-screen app in the background (after a few minutes). On the next launch
// the library finds the saved session but no cookie, decides you signed out and clears the saved session too.
//
// So before it looks, put the cookies back from the saved session, and keep them for 30 days. The token in them is still
// checked by the server and renewed by the library (it lasts an hour; the saved refresh token gets a new one).

const SAVED_SESSION = 'gotrue.user';
const KEEP_SECONDS = 30 * 24 * 60 * 60;

type Saved = { token?: { access_token?: string; refresh_token?: string } };

/** Where the cookies and the saved session live: the browser's, or stand-ins in tests. */
export type SessionPlace = { getCookie: () => string; setCookie: (cookie: string) => void; getSaved: () => string | null };

const browser: SessionPlace = {
  getCookie: () => document.cookie,
  setCookie: (c) => {
    document.cookie = c;
  },
  getSaved: () => localStorage.getItem(SAVED_SESSION),
};

const cookie = (name: string, value: string) => `${name}=${encodeURIComponent(value)}; path=/; max-age=${KEEP_SECONDS}; secure; samesite=lax`;

/** Write the auth cookies so they outlast the app being closed. */
export function keepAuthCookies(accessToken: string, refreshToken?: string, place: SessionPlace = browser) {
  place.setCookie(cookie('nf_jwt', accessToken));
  if (refreshToken) place.setCookie(cookie('nf_refresh', refreshToken));
}

/**
 * When there's a saved session but the nf_jwt cookie is gone, write the cookies again from it.
 * Returns true when it put them back.
 */
export function restoreAuthCookies(place: SessionPlace = browser): boolean {
  try {
    if (/(?:^|;\s*)nf_jwt=[^;]/.test(place.getCookie())) return false;
    const saved = JSON.parse(place.getSaved() ?? 'null') as Saved | null;
    const token = saved?.token;
    if (!token?.access_token) return false;
    keepAuthCookies(token.access_token, token.refresh_token, place);
    return true;
  } catch {
    // no storage, or a session that can't be read: sign in as usual
    return false;
  }
}

/** After the library renews the token (it writes session cookies again), make the new ones last too. */
export function keepSavedSessionCookies(place: SessionPlace = browser) {
  try {
    const token = (JSON.parse(place.getSaved() ?? 'null') as Saved | null)?.token;
    if (token?.access_token) keepAuthCookies(token.access_token, token.refresh_token, place);
  } catch {
    /* nothing to keep */
  }
}
