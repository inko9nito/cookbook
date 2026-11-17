import { Page, Navbar, Block } from 'framework7-react';
import { showTabbar } from '../components/ui/tabbar';
import CookingFab from '../components/CookingFab';

export default function GroceriesPage() {
  return (
    <Page name="groceries" onPageAfterIn={showTabbar}>
      {/* issue #85: back to tucked-away cook mode; part of the page, so it slides with it */}
      <CookingFab slot="fixed" />
      <Navbar className="ck-navbar-root" title="Groceries" />
      <Block className="ck-note">Placeholder. The grocery list comes in a later phase.</Block>
    </Page>
  );
}
