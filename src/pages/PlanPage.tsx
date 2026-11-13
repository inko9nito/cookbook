import { Page, Navbar, NavTitle, NavTitleLarge, Block } from 'framework7-react';

export default function PlanPage() {
  return (
    <Page name="plan">
      <Navbar large>
        <NavTitle>Plan</NavTitle>
        <NavTitleLarge>Plan</NavTitleLarge>
      </Navbar>
      <Block className="demo-banner">Placeholder. The calendar and meal plans are Phase 5.</Block>
    </Page>
  );
}
