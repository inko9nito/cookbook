import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Page, Navbar, NavTitle, List, ListItem, Link, Block, BlockFooter, Toggle, f7 } from 'framework7-react';
import { showTabbar } from '../components/ui/tabbar';
import { useAuth } from '../data/auth';
import { clearCache, useAccount } from '../data/store';
import { inlineIcon } from '../components/ui/icons';
import { appVersion, updateApp } from '../lib/appUpdate';
import { reopenOnTab } from '../data/startTab';
import { say, tell } from '../components/ui/toast';
import { setPushWanted, usePush } from '../data/push';

export default function SettingsPage() {
  const { email, signOut } = useAuth();
  const { admin } = useAccount();
  const push = usePush();
  const confirmSignOut = () =>
    f7.dialog
      .create({
        title: 'Sign out?',
        text: 'Your recipes stay saved. This phone forgets its offline copy until you sign in again.',
        buttons: [
          { text: 'Cancel' },
          {
            text: 'Sign out',
            strong: true,
            onClick: async () => {
              await clearCache();
              await signOut();
            },
          },
        ],
      })
      .open();

  // the home-screen app keeps running the version it has until it's reloaded, and has no pull-to-refresh. The refresh
  // icon spins while it brings in a new version if there is one, then reloads the app either way (issue #91), back on
  // Settings (issue #48). No dialogs.
  const [refreshing, setRefreshing] = useState(false);
  const refreshApp = () => {
    if (refreshing) return;
    setRefreshing(true);
    // spin for at least a moment, so a quick reload still reads as "refreshed"
    const shortest = new Promise((r) => setTimeout(r, 700));
    // the app reloads well before this; if it's somehow still here, stop rather than spin forever (#91)
    setTimeout(() => setRefreshing(false), 30000);
    updateApp({
      beforeReload: async () => {
        reopenOnTab('settings'); // also tells index.html to leave out the cooking pot as the app comes back (#127)
        await shortest;
      },
    });
  };

  // issue #48: tapping the version itself copies it (for a bug report), with a toast to say so
  const copyVersion = async () => {
    try {
      await navigator.clipboard.writeText(appVersion());
      say('Version copied');
    } catch {
      tell('Couldn’t copy the version');
    }
  };

  return (
    <Page name="settings" onPageAfterIn={showTabbar}>
      {/* issue #27: Settings is a tab now, so its first page has a tab title and no back button */}
      <Navbar key="navbar" className="ck-navbar-root">
        <NavTitle>Settings</NavTitle>
      </Navbar>
      {/* issue #128: no group titles; the account, then one card of places to go, then the version on the page itself */}
      <List strongIos insetIos dividersIos className="ck-settings-account">
        {/* one row: who's signed in, and Sign Out beside it (the local demo signs in as demo@example.com) */}
        <ListItem title={email} className="ck-account-row">
          <Link slot="after" className="ck-sign-out" onClick={confirmSignOut}>
            Sign Out
          </Link>
        </ListItem>
      </List>
      {/* bringing recipes over from Prepear (issue #14; only into the admin's cookbook, #146), and the design system
          (the Style Guide). The grocery stores live on the Groceries tab now (issue #129) */}
      <List strongIos insetIos dividersIos className="ck-settings-places">
        {admin && <ListItem link="/settings/prepear/" title="Import" />}
        <ListItem link="/settings/style-guide/" title="Appearance" />
      </List>
      {/* issue #169: a push when a cook mode timer is up, and the count of recipes cooking on the app icon. Only where
          the phone can (the home-screen app); iOS asks the first time a timer starts, or when it's switched on here */}
      {push.supported && (
        <List key="push" strongIos insetIos dividersIos className="ck-settings-push">
          <ListItem title="Timer Notifications">
            <Toggle
              slot="after"
              checked={push.wanted && push.permission !== 'denied'}
              disabled={push.permission === 'denied'}
              onChange={(e: { target: HTMLInputElement }) => setPushWanted(e.target.checked)}
            />
          </ListItem>
        </List>
      )}
      {push.supported && push.permission === 'denied' && (
        <BlockFooter key="push-denied" className="ck-settings-push-note">
          Notifications are off for Cookbook. Turn them on in the iPhone’s Settings → Notifications → Cookbook.
        </BlockFooter>
      )}
      {/* the build running, on the page rather than in a card: tapping it copies it; the refresh icon beside it
          brings in a newer one and reloads the app (issues #48, #91, #128) */}
      <Block key="version" className="ck-version">
        <span className="ck-version-text" role="button" tabIndex={0} onClick={copyVersion} onKeyDown={(e) => e.key === 'Enter' && copyVersion()}>
          {appVersion()}
        </span>
        <Link iconOnly className="ck-refresh-button" aria-label="Refresh the app" onClick={refreshApp}>
          <RefreshCw {...inlineIcon} className={`ck-icon ck-refresh ${refreshing ? 'ck-spinning' : ''}`} aria-hidden="true" />
        </Link>
      </Block>
    </Page>
  );
}
