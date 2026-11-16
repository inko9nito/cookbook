import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Page, Navbar, List, ListItem, Link, BlockTitle, f7 } from 'framework7-react';
import { showTabbar } from '../components/ui/tabbar';
import { useAuth } from '../data/auth';
import { clearCache } from '../data/store';
import { inlineIcon } from '../components/ui/icons';
import { appVersion, updateApp } from '../lib/appUpdate';
import { FONTS, applyFont, savedFont } from '../theme/fonts';

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

  // the home-screen app keeps running the version it has until it's reloaded with a new one. Tapping the version checks:
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

  // font trial (issue #21): each choice switches the whole app at once, named in its own font
  const [font, setFont] = useState(savedFont);
  const chooseFont = (id: string) => {
    setFont(id);
    applyFont(id);
  };

  return (
    <Page name="settings" onPageAfterIn={showTabbar}>
      <Navbar title="Settings" backLink />
      <BlockTitle>Account</BlockTitle>
      <List strongIos insetIos dividersIos>
        {/* one row: who's signed in, and Sign Out beside it (the local demo signs in as demo@example.com) */}
        <ListItem title={email} className="ck-account-row">
          <Link slot="after" className="ck-sign-out" onClick={confirmSignOut}>
            Sign Out
          </Link>
        </ListItem>
      </List>
      {/* the build running; tapping it checks for a newer one */}
      <BlockTitle>Version</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem link="#" noChevron title={appVersion()} onClick={checkForUpdates} className="ck-version-row" aria-label={`Version ${appVersion()}, check for updates`}>
          <RefreshCw slot="after" {...inlineIcon} className={`ck-icon ck-refresh ${checking ? 'ck-spinning' : ''}`} aria-hidden="true" />
        </ListItem>
      </List>
      {/* the design system, by its name, under its own title like the other groups */}
      <BlockTitle>Style Guide</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem link="/settings/style-guide/" title="Cookbook" />
      </List>
      <BlockTitle>Font</BlockTitle>
      <List strongIos insetIos dividersIos className="ck-font-list">
        {FONTS.map((f) => (
          <ListItem
            key={f.id}
            radio
            radioIcon="end"
            name="font"
            value={f.id}
            title={f.name}
            checked={font === f.id}
            onChange={() => chooseFont(f.id)}
            style={{ fontFamily: f.family }}
          />
        ))}
      </List>
    </Page>
  );
}
