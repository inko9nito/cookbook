import { describe, expect, test } from 'vitest';
import { keepSavedSessionCookies, restoreAuthCookies, type SessionPlace } from './session';

// a stand-in for document.cookie and localStorage
function place(cookies: string, saved: unknown) {
  const written: string[] = [];
  const p: SessionPlace = {
    getCookie: () => cookies,
    setCookie: (c) => written.push(c),
    getSaved: () => (saved === null ? null : typeof saved === 'string' ? saved : JSON.stringify(saved)),
  };
  return { p, written };
}

const session = { url: 'https://x/.netlify/identity', token: { access_token: 'aaa', refresh_token: 'rrr', expires_at: 1 } };

describe('staying signed in after iOS closes the app', () => {
  test('puts the cookies back from the saved session, for 30 days', () => {
    const { p, written } = place('', session);
    expect(restoreAuthCookies(p)).toBe(true);
    expect(written).toEqual([
      'nf_jwt=aaa; path=/; max-age=2592000; secure; samesite=lax',
      'nf_refresh=rrr; path=/; max-age=2592000; secure; samesite=lax',
    ]);
  });
  test('leaves cookies that are still there alone', () => {
    const { p, written } = place('other=1; nf_jwt=zzz', session);
    expect(restoreAuthCookies(p)).toBe(false);
    expect(written).toEqual([]);
  });
  test('an emptied cookie counts as gone', () => {
    const { p } = place('nf_jwt=; other=1', session);
    expect(restoreAuthCookies(p)).toBe(true);
  });
  test('nothing to restore when signed out or the session is unreadable', () => {
    expect(restoreAuthCookies(place('', null).p)).toBe(false);
    expect(restoreAuthCookies(place('', '{not json').p)).toBe(false);
    expect(restoreAuthCookies(place('', { url: 'x' }).p)).toBe(false);
  });
  test('renewed tokens are kept for 30 days too', () => {
    const { p, written } = place('nf_jwt=old', session);
    keepSavedSessionCookies(p);
    expect(written[0]).toBe('nf_jwt=aaa; path=/; max-age=2592000; secure; samesite=lax');
  });
});
