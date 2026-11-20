// Signing in: Netlify Identity with Google, invite-only, the same way as the HPDE app (see identity.ts).
// The demo backend (running locally) needs no sign-in.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { isDemo } from './api';
import { accessToken, currentUser, finishSignIn, isFreshArrival, readArrival, signOut as identitySignOut, SignedOutError, startGoogleSignIn } from './identity';

type Auth = {
  status: 'checking' | 'signedIn' | 'signedOut';
  email?: string;
  /** why signing in didn't work, shown on the sign-in screen */
  problem?: string;
  signIn: () => void;
  signOut: () => Promise<void>;
  /** the API refused this account (no role, #146), or the sign-in lapsed: sign out and say why */
  refuse: (message?: string) => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

const demoSignIn = isDemo && typeof location !== 'undefined' && new URLSearchParams(location.search).has('signin');

// read before anything else touches the address: Google's answer, an invite link, or an error
const arrival = !isDemo && typeof location !== 'undefined' ? readArrival(location.hash) : null;
// a sign-in from Google that's already been used (the back gesture reopened its address) is ignored, not tried again
const freshToken = arrival?.kind === 'token' && isFreshArrival(arrival.params, currentUser());

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Pick<Auth, 'status' | 'email' | 'problem'>>(() => {
    // the demo is signed in, unless opened with ?signin to show the sign-in screen (the UI check does)
    if (isDemo) return { status: demoSignIn ? 'signedOut' : 'signedIn', email: 'demo@example.com' };
    // a sign-in saved on the phone counts at once, so the app opens straight to the recipes, even offline
    const saved = freshToken ? null : currentUser();
    return saved ? { status: 'signedIn', email: saved.email } : { status: freshToken ? 'checking' : 'signedOut' };
  });
  const invite = useRef(arrival?.kind === 'invite' ? arrival.token : undefined);

  useEffect(() => {
    if (isDemo) return;
    let live = true;
    // drop the token from the address so a reload doesn't try to use it again
    if (arrival) history.replaceState(null, '', location.pathname + location.search);
    if (arrival?.kind === 'token' && freshToken) {
      finishSignIn(arrival.params)
        .then((user) => live && setState({ status: 'signedIn', email: user.email }))
        .catch(() => {
          if (!live) return;
          // a sign-in already saved on the phone still counts
          const saved = currentUser();
          setState(saved ? { status: 'signedIn', email: saved.email } : { status: 'signedOut', problem: 'Signing in didn’t work. Try again.' });
        });
    } else if (arrival?.kind === 'invite') {
      setState({ status: 'signedOut', problem: 'You’re invited. Continue with Google, using the address the invite was sent to.' });
    } else if (arrival?.kind === 'error') {
      setState({ status: 'signedOut', problem: arrival.message });
    }

    // renew the sign-in in the background when the app opens or comes back to the front, so a save never waits on it
    // (or only then finds the sign-in lapsed); it only goes to the network when the token is due
    const renewIfVisible = () => {
      if (document.visibilityState !== 'visible' || !currentUser()) return;
      accessToken().catch((e) => {
        if (e instanceof SignedOutError && live) setState({ status: 'signedOut', problem: 'Your sign-in ran out. Sign in again.' });
      });
    };
    renewIfVisible();
    document.addEventListener('visibilitychange', renewIfVisible);
    window.addEventListener('focus', renewIfVisible);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', renewIfVisible);
      window.removeEventListener('focus', renewIfVisible);
    };
  }, []);

  const auth: Auth = {
    ...state,
    signIn: () => {
      if (isDemo) return setState({ status: 'signedIn', email: 'demo@example.com' });
      setState((s) => ({ ...s, problem: undefined }));
      startGoogleSignIn(invite.current);
    },
    signOut: async () => {
      await identitySignOut();
      setState({ status: 'signedOut' });
    },
    refuse: async (message) => {
      await identitySignOut();
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
