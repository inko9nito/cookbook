import { Page, Navbar, List, ListItem, Block } from 'framework7-react';
import { showTabbar } from '../components/ui/tabbar';
import { demoCookbooks } from '../demo/data';

export default function CookbooksPage() {
  return (
    <Page name="cookbooks" onPageAfterIn={showTabbar}>
      <Navbar className="ck-navbar-root" title="Cookbooks" />
      <Block className="ck-note">Placeholder. Cookbooks are Phase 4.</Block>
      <List strongIos insetIos dividersIos>
        {demoCookbooks.map((c) => (
          <ListItem key={c.id} title={c.name} after={`${c.count}`} />
        ))}
      </List>
    </Page>
  );
}
