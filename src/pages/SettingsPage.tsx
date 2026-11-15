import { Page, Navbar, List, ListItem, BlockFooter } from 'framework7-react';
import { showTabbar } from '../components/ui/tabbar';

export default function SettingsPage() {
  return (
    <Page name="settings" onPageAfterIn={showTabbar}>
      <Navbar title="Settings" backLink />
      <List strongIos insetIos dividersIos>
        <ListItem link="/settings/style-guide/" title="Style Guide" />
      </List>
      <BlockFooter>The Style Guide shows every component in the Cookbook design system.</BlockFooter>
    </Page>
  );
}
