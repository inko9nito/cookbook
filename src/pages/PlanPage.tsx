import { Page, Navbar, Block } from 'framework7-react';
import { showTabbar } from '../components/ui/tabbar';

export default function PlanPage() {
  return (
    <Page name="plan" onPageAfterIn={showTabbar}>
      <Navbar className="ck-navbar-root" title="Plan" />
      <Block className="ck-note">Placeholder. The calendar and meal plans are Phase 5.</Block>
    </Page>
  );
}
