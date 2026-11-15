import { Page, Navbar, List, ListItem, ListButton, BlockTitle, BlockFooter, f7 } from 'framework7-react';
import { showTabbar } from '../components/ui/tabbar';
import { useAuth } from '../data/auth';
import { clearCache } from '../data/store';
import { isDemo } from '../data/api';
import { useState } from 'react';
import { readConvertLayout, saveConvertLayout, type ConvertLayout } from '../components/ui/convertLayout';

export default function SettingsPage() {
  const { email, signOut } = useAuth();
  const [layout, setLayout] = useState<ConvertLayout>(readConvertLayout);
  const pickLayout = (l: ConvertLayout) => {
    saveConvertLayout(l);
    setLayout(l);
  };
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
      {/* TEMPORARY (issue #6): try both layouts of the unit popover on the phone, then remove this */}
      <BlockTitle>Try out: unit conversions</BlockTitle>
      <List strongIos insetIos dividersIos className="ck-try-layout">
        <ListItem radio name="ck-layout" checked={layout === 'beside'} onChange={() => pickLayout('beside')} title="Beside the amount" />
        <ListItem radio name="ck-layout" checked={layout === 'above'} onChange={() => pickLayout('above')} title="Above the ingredient" />
      </List>
      <BlockFooter>Where the list of units opens when you tap an underlined amount. Temporary, while you choose.</BlockFooter>
      <List strongIos insetIos dividersIos>
        <ListItem link="/settings/style-guide/" title="Style Guide" />
      </List>
      <BlockFooter>The Style Guide shows every component in the Cookbook design system.</BlockFooter>
    </Page>
  );
}
