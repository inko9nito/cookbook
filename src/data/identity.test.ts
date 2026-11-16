import { describe, expect, test } from 'vitest';
import type { User } from 'gotrue-js';
import { adoptSavedToken, isFreshArrival, readArrival, tokenExpiry } from './identity';

const token = (refresh: string, expires: number) => ({ access_token: `a-${refresh}`, refresh_token: refresh, expires_at: expires, expires_in: 3600, token_type: 'bearer' as const });
const storage = (saved: unknown) => ({ getItem: () => JSON.stringify(saved) });

describe('adoptSavedToken (the newest refresh token on the phone wins)', () => {
  test('takes a newer token another copy of the app saved', () => {
    const user = { id: 'u1', token: token('old', 100) } as unknown as User;
    adoptSavedToken(user, storage({ id: 'u1', token: token('new', 200) }));
    expect(user.token?.refresh_token).toBe('new');
  });
  test('keeps its own when the saved one is older, the same, or someone else’s', () => {
    for (const saved of [{ id: 'u1', token: token('older', 50) }, { id: 'u1', token: token('mine', 100) }, { id: 'u2', token: token('theirs', 300) }, null]) {
      const user = { id: 'u1', token: token('mine', 100) } as unknown as User;
      adoptSavedToken(user, storage(saved));
      expect(user.token?.refresh_token).toBe('mine');
    }
  });
});

describe('readArrival (what the address says after a sign-in link)', () => {
  test('back from Google with a token', () => {
    const a = readArrival('#access_token=abc&expires_in=3600&refresh_token=r&token_type=bearer');
    expect(a?.kind).toBe('token');
    expect(a?.kind === 'token' && a.params.get('refresh_token')).toBe('r');
  });
  test('an invite link', () => expect(readArrival('#invite_token=xyz')).toEqual({ kind: 'invite', token: 'xyz' }));
  test('an error', () =>
    expect(readArrival('#error=access_denied&error_description=Signups+not+allowed+for+this+instance')).toEqual({
      kind: 'error',
      message: 'Signups not allowed for this instance',
    }));
  test('an ordinary address', () => expect(readArrival('')).toBeNull());
});

describe('isFreshArrival (a sign-in reopened by the back gesture is ignored)', () => {
  const now = 1_800_000_000_000;
  const jwt = (expMs: number) => `h.${btoa(JSON.stringify({ exp: expMs / 1000 })).replace(/=+$/, '')}.s`;
  const arrival = (expMs: number) => new URLSearchParams({ access_token: jwt(expMs), refresh_token: 'r' });
  const saved = (expMs: number) => ({ token: token('saved', expMs) }) as unknown as User;

  test('reads the expiry from the token', () => {
    expect(tokenExpiry(jwt(now))).toBe(now);
    expect(tokenExpiry('not a token')).toBe(0);
  });
  test('a new sign-in counts', () => {
    expect(isFreshArrival(arrival(now + 3_600_000), null, now)).toBe(true);
    expect(isFreshArrival(arrival(now + 3_600_000), saved(now + 1_000_000), now)).toBe(true);
  });
  test('a token that has run out, or is about to, does not', () => {
    expect(isFreshArrival(arrival(now - 1), null, now)).toBe(false);
    expect(isFreshArrival(arrival(now + 30_000), null, now)).toBe(false);
  });
  test('an older sign-in than the one saved on the phone does not', () =>
    expect(isFreshArrival(arrival(now + 1_000_000), saved(now + 3_600_000), now)).toBe(false));
  test('an unreadable token does not', () =>
    expect(isFreshArrival(new URLSearchParams({ access_token: 'abc' }), null, now)).toBe(false));
});
