import { describe, expect, test } from 'vitest';
import { accountFrom, refuseUnlessAdmin, UNAVAILABLE, userFromRequest } from './http';

// Netlify Identity's /user, answering for one good token
const identity = (roles: string[] | undefined) =>
  (async (url: string | URL, init?: RequestInit) => {
    expect(String(url)).toBe('https://cookbk.netlify.app/.netlify/identity/user');
    const auth = new Headers(init?.headers).get('authorization');
    if (auth !== 'Bearer good') return new Response('{}', { status: 401 });
    return Response.json({ id: 'u1', email: 'me@example.com', app_metadata: roles ? { roles } : {} });
  }) as typeof fetch;

const req = (auth?: string) => new Request('https://cookbk.netlify.app/api/recipes', { headers: auth ? { authorization: auth } : {} });

describe('who is calling the API', () => {
  test('a valid Bearer token is the user Identity says it is', async () => {
    expect(await userFromRequest(req('Bearer good'), identity(['admin']))).toMatchObject({ id: 'u1', email: 'me@example.com' });
  });
  test('no token or a bad token: nobody', async () => {
    expect(await userFromRequest(req(), identity(['admin']))).toBeNull();
    expect(await userFromRequest(req('Bearer forged'), identity(['admin']))).toBeNull();
    expect(await userFromRequest(req('Basic abc'), identity(['admin']))).toBeNull();
  });
  test('Identity unreachable or failing: unavailable, not nobody (#114)', async () => {
    expect(await userFromRequest(req('Bearer good'), (async () => { throw new TypeError('offline'); }) as typeof fetch)).toBe(UNAVAILABLE);
    for (const status of [500, 502, 503, 429])
      expect(await userFromRequest(req('Bearer good'), (async () => new Response('', { status })) as typeof fetch)).toBe(UNAVAILABLE);
  });
});

describe('whose cookbook a sign-in opens (#146)', () => {
  test('admin: the original cookbook', async () => {
    expect(await accountFrom(req('Bearer good'), identity(['admin']))).toEqual({ owner: '', admin: true });
    expect(await accountFrom(req('Bearer good'), identity(['user', 'admin']))).toEqual({ owner: '', admin: true });
  });
  test('user: a cookbook of its own, under its Identity id', async () => {
    expect(await accountFrom(req('Bearer good'), identity(['user']))).toEqual({ owner: 'u1', admin: false });
  });
  test('no role: 403, and the reason', async () => {
    const res = (await accountFrom(req('Bearer good'), identity(undefined))) as Response;
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/doesn’t have a cookbook yet/);
  });
});

describe('only an admin can do the admin’s things (Claude, Prepear)', () => {
  test('admin role: allowed', async () => {
    expect(await refuseUnlessAdmin(req('Bearer good'), identity(['admin']))).toBeNull();
  });
  test('user role: 403', async () => {
    expect((await refuseUnlessAdmin(req('Bearer good'), identity(['user'])))?.status).toBe(403);
  });
  test('signed in without the role: 403', async () => {
    expect((await refuseUnlessAdmin(req('Bearer good'), identity(['editor'])))?.status).toBe(403);
    expect((await refuseUnlessAdmin(req('Bearer good'), identity(undefined)))?.status).toBe(403);
  });
  test('not signed in: 401', async () => {
    expect((await refuseUnlessAdmin(req(), identity(['admin'])))?.status).toBe(401);
  });
  test('Identity couldn’t check: 503, so the app tries again and stays signed in (#114)', async () => {
    expect((await refuseUnlessAdmin(req('Bearer good'), (async () => new Response('', { status: 502 })) as typeof fetch))?.status).toBe(503);
  });
});
