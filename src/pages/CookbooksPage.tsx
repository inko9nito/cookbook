import { Page, Navbar, NavTitle, NavRight, Link, Block, Button, Preloader, f7 } from 'framework7-react';
import { Plus } from 'lucide-react';
import { navIcon } from '../components/ui/icons';
import { showTabbar } from '../components/ui/tabbar';
import CookbookTile from '../components/ui/CookbookTile';
import { useCookbooks, useStore } from '../data/store';
import { byName, cookbookRecipeIds, coverOf, emptyCookbook, existing } from '../lib/cookbook';
import { newId } from '../lib/recipe';

type Props = { f7router?: { navigate: (url: string) => void } };

/** Ask for a name and make an empty cookbook (Framework7's prompt dialog). */
export function promptNewCookbook(onMade: (id: string) => void, save: ReturnType<typeof useCookbooks>['saveCookbook']) {
  f7.dialog.prompt('Name it after what’s in it, like “Soups” or “Holidays”.', 'New Cookbook', (name: string) => {
    if (!name.trim()) return;
    const c = emptyCookbook(name, newId);
    save(c);
    onMade(c.id);
  });
}

/**
 * The Cookbooks tab (issue #25): every cookbook as a tile (cover, name, how many recipes), A–Z, two to a row like the
 * recipe tiles. + makes a new one. With none yet, a note and the way to bring in Prepear's.
 */
export default function CookbooksPage({ f7router }: Props) {
  const { recipes } = useStore();
  const { cookbooks, loading, loadError, reload, saveCookbook } = useCookbooks();
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const sorted = [...cookbooks].sort(byName);
  const add = () => promptNewCookbook((id) => f7router?.navigate(`/cookbook/${id}/`), saveCookbook);

  return (
    <Page name="cookbooks" onPageAfterIn={showTabbar}>
      <Navbar key="navbar" className="ck-navbar-root">
        <NavTitle>Cookbooks</NavTitle>
        <NavRight>
          <Link iconOnly onClick={add} aria-label="New cookbook">
            <Plus {...navIcon} />
          </Link>
        </NavRight>
      </Navbar>

      {/* keys: Page leaves out the blocks that aren't shown and lists the rest by position (see RecipesPage) */}
      {sorted.length > 0 && (
        <Block key="count" className="ck-count">
          <span className="ck-note">{sorted.length === 1 ? '1 cookbook' : `${sorted.length} cookbooks`}</span>
        </Block>
      )}
      {loading && (
        <Block key="loading" className="ck-list-state">
          <Preloader />
        </Block>
      )}
      {loadError && (
        <Block key="error" className="ck-list-state">
          <p className="ck-note">Couldn’t load your cookbooks. {loadError}</p>
          <Button round className="ck-soft ck-inline-button" onClick={() => reload()}>
            Try again
          </Button>
        </Block>
      )}
      {!loading && !loadError && sorted.length === 0 && (
        <Block key="empty" className="ck-list-state ck-books-empty">
          <p className="ck-note">No cookbooks yet. Make one, or bring in your cookbooks from Prepear.</p>
          <Button round fill className="ck-main ck-inline-button" onClick={add}>
            New cookbook
          </Button>
          <Button round className="ck-soft ck-inline-button" href="/settings/prepear/">
            Import from Prepear
          </Button>
        </Block>
      )}
      <Block key="grid" className="ck-card-grid">
        <div className="grid grid-cols-2 grid-gap">
          {sorted.map((c) => {
            const ids = cookbookRecipeIds(c);
            return <CookbookTile key={c.id} href={`/cookbook/${c.id}/`} name={c.name} count={existing(ids, byId).length} cover={coverOf(c.coverRecipeId, ids, byId)} />;
          })}
        </div>
      </Block>
    </Page>
  );
}
