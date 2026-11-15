import { Page, Navbar, List, ListItem, ListButton, BlockTitle, BlockFooter, f7 } from 'framework7-react';
import { showTabbar } from '../components/ui/tabbar';
import { useAuth } from '../data/auth';
import { clearCache } from '../data/store';
import { isDemo } from '../data/api';
import { useState } from 'react';
import { readUnitPickerMode, saveUnitPickerMode, type UnitPickerMode } from '../components/ui/unitPickerMode';

export default function SettingsPage() {
  const { email, signOut } = useAuth();
  const [unitPicker, setUnitPicker] = useState<UnitPickerMode>(readUnitPickerMode);
  const pickUnitPicker = (mode: UnitPickerMode) => {
    saveUnitPickerMode(mode);
    setUnitPicker(mode);
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
      {/* TEMPORARY (issue #6): compare the two ways of showing unit choices on the phone, then remove this */}
      <BlockTitle>Try out: unit conversions</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem radio name="ck-unit-picker" checked={unitPicker === 'sheet'} onChange={() => pickUnitPicker('sheet')} title="Bottom sheet" />
        <ListItem radio name="ck-unit-picker" checked={unitPicker === 'popover'} onChange={() => pickUnitPicker('popover')} title="Popover beside the amount" />
      </List>
      <BlockFooter>Where the unit choices open when you tap an underlined amount. Temporary, while you choose.</BlockFooter>
      <List strongIos insetIos dividersIos>
        <ListItem link="/settings/style-guide/" title="Style Guide" />
      </List>
      <BlockFooter>The Style Guide shows every component in the Cookbook design system.</BlockFooter>
    </Page>
  );
}
