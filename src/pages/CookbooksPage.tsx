import { Page, Navbar, NavTitle, NavRight, Link, Block, Button, Preloader, List, ListItem, f7 } from 'framework7-react';
import { LayoutGrid, List as ListIcon, Plus } from 'lucide-react';
import { navIcon } from '../components/ui/icons';
import { showTabbar } from '../components/ui/tabbar';
import CookbookTile, { CookbookCollage } from '../components/ui/CookbookTile';
import { useCookbooks, useStore } from '../data/store';
import { byName, cookbookRecipeIds, coverPhotos, coversOf, emptyCookbook, existing, type Cookbook } from '../lib/cookbook';
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
 * The Cookbooks tab (issue #25): every cookbook A–Z, as collage tiles two to a row, or as a list (each row a small
 * collage, the name, how many recipes and sections). The button next to + switches between them, remembered like the
 * recipe sort. + makes a new cookbook. With none yet, a note and the way to bring in Prepear's.
 */
export default function CookbooksPage({ f7router }: Props) {
  const { recipes, settings, setCookbookView } = useStore();
  const asList = settings.cookbookView === 'list';
  const { cookbooks, loading, loadError, reload, saveCookbook } = useCookbooks();
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const sorted = [...cookbooks].sort(byName);
  const add = () => promptNewCookbook((id) => f7router?.navigate(`/cookbook/${id}/`), saveCookbook);
  const about = (c: Cookbook) => {
    const ids = cookbookRecipeIds(c);
    const n = existing(ids, byId).length;
    const meta = [`${n} ${n === 1 ? 'recipe' : 'recipes'}`, c.sections.length ? `${c.sections.length} ${c.sections.length === 1 ? 'section' : 'sections'}` : ''];
    return { meta: meta.filter(Boolean).join(' · '), recipes: n, photos: coverPhotos(coversOf(c), ids, byId) };
  };

  return (
    <Page name="cookbooks" onPageAfterIn={showTabbar}>
      <Navbar key="navbar" className="ck-navbar-root">
        <NavTitle>Cookbooks</NavTitle>
        <NavRight>
          <Link iconOnly onClick={add} aria-label="New cookbook">
            <Plus {...navIcon} />
          </Link>
          {/* shows the other view: the list icon while tiles show, the grid icon while the list shows */}
          <Link iconOnly onClick={() => setCookbookView(asList ? 'grid' : 'list')} aria-label={asList ? 'Show as tiles' : 'Show as a list'} className="ck-view-switch">
            {asList ? <LayoutGrid {...navIcon} /> : <ListIcon {...navIcon} />}
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
      {!asList && sorted.length > 0 && (
        <Block key="grid" className="ck-card-grid ck-book-grid">
          <div className="grid grid-cols-2 grid-gap">
            {sorted.map((c) => {
              const { recipes: n, photos } = about(c);
              return <CookbookTile key={c.id} href={`/cookbook/${c.id}/`} name={c.name} recipes={n} sections={c.sections.length} photos={photos} />;
            })}
          </div>
        </Block>
      )}
      {asList && sorted.length > 0 && (
        <List key="list" strongIos insetIos dividersIos className="ck-book-list">
          {sorted.map((c) => {
            const { meta, photos } = about(c);
            return (
              <ListItem key={c.id} link={`/cookbook/${c.id}/`} title={c.name} footer={meta}>
                <span slot="media">
                  <CookbookCollage photos={photos} small />
                </span>
              </ListItem>
            );
          })}
        </List>
      )}
    </Page>
  );
}
