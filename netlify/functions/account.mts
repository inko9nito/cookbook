// /api/account (issue #146): whose cookbook this sign-in opens. { admin: true } for the original cookbook, which has
// everything; { admin: false } for an account with a cookbook of its own, where the app leaves out what only the admin
// can do (reading recipes from photos or links, importing from Prepear). The server refuses those either way.

import type { Config } from '@netlify/functions';
import { accountFrom, error, json } from '../lib/http';

export default async (req: Request) => {
  const account = await accountFrom(req);
  if (account instanceof Response) return account;
  if (req.method !== 'GET') return error(405, 'Not allowed.');
  return json({ admin: account.admin });
};

export const config: Config = { path: '/api/account' };
