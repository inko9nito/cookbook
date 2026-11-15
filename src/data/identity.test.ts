import { describe, expect, test } from 'vitest';
import type { User } from 'gotrue-js';
import { adoptSavedToken, readArrival } from './identity';

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
