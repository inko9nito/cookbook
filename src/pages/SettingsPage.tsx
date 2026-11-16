import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Page, Navbar, List, ListItem, ListButton, BlockTitle, BlockFooter, f7 } from 'framework7-react';
import { showTabbar } from '../components/ui/tabbar';
import { useAuth } from '../data/auth';
import { clearCache } from '../data/store';
import { isDemo } from '../data/api';
import { inlineIcon } from '../components/ui/icons';
import { appVersion, updateApp } from '../lib/appUpdate';

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

  // the home-screen app keeps running the version it has until it's reloaded with a new one. Tapping Version checks:
  // its refresh icon spins meanwhile; a new version reloads the app, otherwise the icon just stops. No dialogs.
  const [checking, setChecking] = useState(false);
  const checkForUpdates = async () => {
    if (checking) return;
    setChecking(true);
    // spin for at least a moment, so a quick answer still reads as "checked"
    const shortest = new Promise((r) => setTimeout(r, 700));
    try {
      const result = await updateApp();
      // no service worker here (a plain browser tab, or local): a reload is the update
      if (result === 'unsupported') window.location.reload();
    } catch {
      /* offline, or the check failed: the icon stops, nothing changes */
    }
    await shortest;
    setChecking(false);
  };

  return (
    <Page name="settings" onPageAfterIn={showTabbar}>
      <Navbar title="Settings" backLink />
      <BlockTitle>Account</BlockTitle>
      <List strongIos insetIos dividersIos>
        {/* an array, not a fragment: Framework7's List only puts the rows it can see into its card */}
        {isDemo
          ? [<ListItem key="demo" title="Demo" after="Changes aren’t saved" />]
          : [
              <ListItem key="who" title="Signed in as" after={email} />,
              <ListButton key="out" color="red" onClick={confirmSignOut}>
                Sign Out
              </ListButton>,
            ]}
      </List>
      <BlockTitle>App</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem link="#" noChevron title="Version" onClick={checkForUpdates} className="ck-version-row" aria-label={`Version ${appVersion()}, check for updates`}>
          <span slot="after" className="ck-version">
            {appVersion()}
            <RefreshCw {...inlineIcon} className={`ck-icon ck-refresh ${checking ? 'ck-spinning' : ''}`} aria-hidden="true" />
          </span>
        </ListItem>
      </List>
      <BlockFooter>Tap Version after a change goes live to load it into the app on your home screen.</BlockFooter>
      {/* the design system, by its name, under its own title like the other groups */}
      <BlockTitle>Style Guide</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem link="/settings/style-guide/" title="Cookbook" />
      </List>
    </Page>
  );
}
