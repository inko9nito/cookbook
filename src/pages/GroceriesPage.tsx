import { Page, Navbar, Block } from 'framework7-react';
import { showTabbar } from '../components/ui/tabbar';

export default function GroceriesPage() {
  return (
    <Page name="groceries" onPageAfterIn={showTabbar}>
      <Navbar className="ck-navbar-root" title="Groceries" />
      <Block className="ck-note">Placeholder. The grocery list comes in a later phase.</Block>
    </Page>
  );
}
