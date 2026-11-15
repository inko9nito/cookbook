import { LoginScreen, Page, Button, Preloader } from 'framework7-react';
import { useAuth } from '../data/auth';

/**
 * The sign-in screen (Framework7 login screen), over the app until signed in: the app icon, its name and one button,
 * Continue with Google. Netlify Identity is invite-only, so only invited Google accounts get past it, and the API
 * also checks the account is the cookbook's owner.
 */
export default function SignInScreen() {
  const { status, problem, signIn } = useAuth();
  return (
    <LoginScreen className="ck-signin" opened={status !== 'signedIn'} animate={false}>
      <Page loginScreen>
        <div className="ck-signin-body">
          <img className="ck-signin-icon" src="/icons/icon-192.png" alt="" width={88} height={88} />
          <h1 className="ck-signin-title">Cookbook</h1>
          <p className="ck-signin-lede">Your recipes, cookbooks and meal plans.</p>
          {status === 'checking' ? (
            <Preloader className="ck-signin-wait" />
          ) : (
            <Button large fill round className="ck-main ck-signin-button" onClick={signIn}>
              Continue with Google
            </Button>
          )}
          {problem && (
            <p className="ck-signin-problem" role="alert">
              {problem}
            </p>
          )}
        </div>
      </Page>
    </LoginScreen>
  );
}
