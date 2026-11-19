import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Page, Navbar, NavTitle, List, ListItem, Link, BlockTitle, f7 } from 'framework7-react';
import { showTabbar } from '../components/ui/tabbar';
import { useAuth } from '../data/auth';
import { clearCache } from '../data/store';
import { inlineIcon } from '../components/ui/icons';
import { appVersion, updateApp } from '../lib/appUpdate';
import { reopenOnTab } from '../data/startTab';
import { say, tell } from '../components/ui/toast';
import { fontName, useFont } from '../data/font';

export default function SettingsPage() {
  const { email, signOut } = useAuth();
  const font = useFont();
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
        reopenOnTab('settings');
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
      {/* issue #64: the Instacart stores the grocery list's links search */}
      <BlockTitle>Groceries</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem link="/grocery-stores/" title="Grocery Stores" />
      </List>
      {/* issue #135: trying fonts, this phone only */}
      <BlockTitle>Appearance</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem link="/settings/font/" title="Font" after={fontName(font)} />
      </List>
      {/* the build running: tapping it copies it; its refresh icon brings in a newer one
          and reloads the app (issues #48, #91) */}
      <BlockTitle>Version</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem title={appVersion()} onClick={copyVersion} className="ck-version-row">
          <Link
            slot="after"
            iconOnly
            className="ck-refresh-link"
            aria-label="Refresh the app"
            onClick={(e: Event) => {
              e.stopPropagation(); // the row copies; this refreshes
              refreshApp();
            }}
          >
            <RefreshCw {...inlineIcon} className={`ck-icon ck-refresh ${refreshing ? 'ck-spinning' : ''}`} aria-hidden="true" />
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
