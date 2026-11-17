import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Page, Navbar, NavTitle, List, ListItem, Link, BlockTitle, f7 } from 'framework7-react';
import { showTabbar } from '../components/ui/tabbar';
import { useAuth } from '../data/auth';
import { clearCache } from '../data/store';
import { inlineIcon } from '../components/ui/icons';
import { appVersion, updateApp } from '../lib/appUpdate';
import { reopenOnTab } from '../data/startTab';
import CookingFab from '../components/CookingFab';

export default function SettingsPage() {
  const { email, signOut } = useAuth();
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

  // the home-screen app keeps running the version it has until it's reloaded with a new one. The refresh icon checks:
  // it spins meanwhile; a new version reloads the app, back on Settings (issue #48), otherwise the icon just stops.
  // No dialogs.
  const [checking, setChecking] = useState(false);
  const checkForUpdates = async () => {
    if (checking) return;
    setChecking(true);
    // spin for at least a moment, so a quick answer still reads as "checked"
    const shortest = new Promise((r) => setTimeout(r, 700));
    const reload = () => {
      reopenOnTab('settings');
      window.location.reload();
    };
    try {
      const result = await updateApp({ beforeReload: () => reopenOnTab('settings') });
      // no service worker here (a plain browser tab, or local): a reload is the update
      if (result === 'unsupported') reload();
    } catch {
      /* offline, or the check failed: the icon stops, nothing changes */
    }
    await shortest;
    setChecking(false);
  };

  // issue #48: tapping the version itself copies it (for a bug report), with a toast to say so
  const copyVersion = async () => {
    let text = 'Version copied';
    try {
      await navigator.clipboard.writeText(appVersion());
    } catch {
      text = 'Couldn’t copy the version';
    }
    f7.toast.show({ text, closeTimeout: 2000 });
  };

  return (
    <Page name="settings" onPageAfterIn={showTabbar}>
      {/* issue #85: back to tucked-away cook mode; part of the page, so it slides with it */}
      <CookingFab slot="fixed" />
      {/* issue #27: Settings is a tab now, so its first page has a tab title and no back button */}
      <Navbar key="navbar" className="ck-navbar-root">
        <NavTitle>Settings</NavTitle>
      </Navbar>
      <BlockTitle>Account</BlockTitle>
      <List strongIos insetIos dividersIos>
        {/* one row: who's signed in, and Sign Out beside it (the local demo signs in as demo@example.com) */}
        <ListItem title={email} className="ck-account-row">
          <Link slot="after" className="ck-sign-out" onClick={confirmSignOut}>
            Sign Out
          </Link>
        </ListItem>
      </List>
      {/* bringing recipes over from Prepear (issue #14) */}
      <BlockTitle>Import</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem link="/settings/prepear/" title="From Prepear" />
      </List>
      {/* the build running: tapping it copies it; its refresh icon checks for a newer one (issue #48) */}
      <BlockTitle>Version</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem title={appVersion()} onClick={copyVersion} className="ck-version-row">
          <Link
            slot="after"
            iconOnly
            className="ck-refresh-link"
            aria-label="Check for updates"
            onClick={(e: Event) => {
              e.stopPropagation(); // the row copies; this checks
              checkForUpdates();
            }}
          >
            <RefreshCw {...inlineIcon} className={`ck-icon ck-refresh ${checking ? 'ck-spinning' : ''}`} aria-hidden="true" />
          </Link>
        </ListItem>
      </List>
      {/* the design system, by its name, under its own title like the other groups */}
      <BlockTitle>Style Guide</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem link="/settings/style-guide/" title="Cookbook" />
      </List>
    </Page>
  );
}
