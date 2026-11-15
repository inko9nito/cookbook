// Signing in: Netlify Identity with Google, invite-only. The demo backend (running locally) needs no sign-in.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getUser, handleAuthCallback, logout, oauthLogin, onAuthChange } from '@netlify/identity';
import { isDemo } from './api';
import { keepSavedSessionCookies, restoreAuthCookies } from './session';

type Auth = {
  status: 'checking' | 'signedIn' | 'signedOut';
  email?: string;
  /** why signing in didn't work, shown on the sign-in screen */
  problem?: string;
  signIn: () => void;
  signOut: () => Promise<void>;
  /** the API refused this account (no admin role): sign out and say why */
  refuse: (message: string) => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

// iOS drops the sign-in cookies when it closes the home-screen app: put them back before anything checks (session.ts)
if (!isDemo && typeof document !== 'undefined') restoreAuthCookies();

const demoSignIn = isDemo && typeof location !== 'undefined' && new URLSearchParams(location.search).has('signin');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Pick<Auth, 'status' | 'email' | 'problem'>>(
    // the demo is signed in, unless opened with ?signin to show the sign-in screen (the UI check does)
    isDemo ? { status: demoSignIn ? 'signedOut' : 'signedIn', email: 'Demo' } : { status: 'checking' },
  );

  useEffect(() => {
    if (isDemo) return;
    let live = true;
    (async () => {
      let problem: string | undefined;
      try {
        // finishes the Google sign-in when the page loads from its redirect (the token is in the address)
        const result = await handleAuthCallback();
        // the invite email's link: there's no password to choose, signing in with Google (same address) accepts it
        if (result?.type === 'invite') problem = 'You’re invited. Continue with Google, using the address the invite was sent to.';
      } catch (e) {
        problem = e instanceof Error ? e.message : 'Signing in didn’t work.';
      }
      // drop the token from the address so a reload doesn't try to use it again
      if (/(access_token|invite_token|error)=/.test(location.hash)) history.replaceState(null, '', location.pathname);
      const user = await getUser();
      if (user) keepSavedSessionCookies();
      if (live) setState(user ? { status: 'signedIn', email: user.email } : { status: 'signedOut', problem });
    })();
    const off = onAuthChange((_event, user) => {
      // the library writes new cookies (that iOS would drop) on sign-in and every token renewal: make them last
      if (user) keepSavedSessionCookies();
      if (!live) return;
      setState((s) => (user ? { status: 'signedIn', email: user.email } : { status: 'signedOut', problem: s.problem }));
    });
    return () => {
      live = false;
      off();
    };
  }, []);

  const signOut = async () => {
    await logout().catch(() => undefined);
    setState({ status: 'signedOut' });
  };

  const auth: Auth = {
    ...state,
    signIn: () => {
      if (isDemo) return setState({ status: 'signedIn', email: 'Demo' });
      setState((s) => ({ ...s, problem: undefined }));
      oauthLogin('google');
    },
    signOut,
    refuse: async (message) => {
      await logout().catch(() => undefined);
      setState({ status: 'signedOut', problem: message });
    },
  };

  return <Ctx.Provider value={auth}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth outside AuthProvider');
  return a;
};
