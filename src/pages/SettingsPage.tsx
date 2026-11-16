import { Page, Navbar, List, ListItem, ListButton, BlockTitle, BlockFooter, f7 } from 'framework7-react';
import { showTabbar } from '../components/ui/tabbar';
import { useAuth } from '../data/auth';
import { clearCache } from '../data/store';
import { isDemo } from '../data/api';
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

  // the home-screen app keeps running the version it has until it's reloaded with a new one: check and update here
  const checkForUpdates = async () => {
    const checking = f7.dialog.preloader('Checking for updates…');
    try {
      const result = await updateApp();
      checking.close();
      if (result === 'latest') f7.toast.show({ text: 'You have the latest version', closeTimeout: 2000 });
      // no service worker here (a plain browser tab, or local): a reload is the update
      else window.location.reload();
    } catch {
      checking.close();
      f7.toast.show({ text: 'Couldn’t check for updates. Are you online?', closeTimeout: 2500 });
    }
  };

  return (
    <Page name="settings" onPageAfterIn={showTabbar}>
      <Navbar title="Settings" backLink />
      <BlockTitle>Account</BlockTitle>
      <List strongIos insetIos dividersIos>
        {isDemo ? (
          <ListItem title="Demo" after="Changes aren’t saved" />
        ) : (
          <>
            <ListItem title="Signed in as" after={email} />
            <ListButton color="red" onClick={confirmSignOut}>
              Sign Out
            </ListButton>
          </>
        )}
      </List>
      <BlockTitle>App</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem title="Version" after={appVersion()} />
        <ListButton onClick={checkForUpdates}>Check for Updates</ListButton>
      </List>
      <BlockFooter>After a change goes live, this loads it into the app on your home screen.</BlockFooter>
      <List strongIos insetIos dividersIos>
        <ListItem link="/settings/style-guide/" title="Style Guide" />
      </List>
      <BlockFooter>The Style Guide shows every component in the Cookbook design system.</BlockFooter>
    </Page>
  );
}
