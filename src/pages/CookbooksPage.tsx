import { Page, Navbar, NavTitle, NavTitleLarge, List, ListItem, Block } from 'framework7-react';
import { demoCookbooks } from '../demo/data';

export default function CookbooksPage() {
  return (
    <Page name="cookbooks">
      <Navbar large>
        <NavTitle>Cookbooks</NavTitle>
        <NavTitleLarge>Cookbooks</NavTitleLarge>
      </Navbar>
      <Block className="demo-banner">Placeholder. Cookbooks are Phase 4.</Block>
      <List strongIos insetIos dividersIos>
        {demoCookbooks.map((c) => (
          <ListItem key={c.id} title={c.name} after={`${c.count}`} />
        ))}
      </List>
    </Page>
  );
}
