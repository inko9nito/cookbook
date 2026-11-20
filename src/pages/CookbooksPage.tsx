import { Page, Navbar, NavTitle, NavRight, Link, Block, Button, List, ListItem, f7 } from 'framework7-react';
import { BookHeart, LayoutGrid, List as ListIcon, Plus } from 'lucide-react';
import { navIcon } from '../components/ui/icons';
import { showTabbar } from '../components/ui/tabbar';
import CookbookTile, { CookbookThumb } from '../components/ui/CookbookTile';
import { CookbookGridSkeleton, CookbookListSkeleton, CountSkeleton } from '../components/ui/Skeletons';
import { useCookbooks, useStore } from '../data/store';
import { byName, colorOf, cookbookRecipeIds, emptyCookbook, existing, platePhotos, type Cookbook } from '../lib/cookbook';
import { newId } from '../lib/recipe';
import CookingFab from '../components/CookingFab';
import EmptyState from '../components/ui/EmptyState';
import { photosOff } from '../components/ui/photo';
import { say, tell } from '../components/ui/toast';
import { copyLater, headerReport, headerReportOn } from '../data/headerReport';

type Props = { f7router?: { navigate: (url: string) => void } };

// issue #141 (temporary): copy the header report, then switch off the header's own drawing layer (the #123 will-change)
// to see whether the title comes back
async function reportHeader(pageEl: Element | null) {
  const copied = await copyLater(headerReport(pageEl));
  pageEl?.querySelector<HTMLElement>(':scope > .navbar')?.style.setProperty('will-change', 'auto');
  if (copied) say('Report copied. Paste it in #141');
  else tell('Couldn’t copy the report');
}

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
 * The Cookbooks tab (issue #25): every cookbook A–Z, as cards two to a row (its soft colour, three recipes as plates,
 * the name and counts), or as a list (each row a small square in its colour with its first plate). The button next to + switches between them, remembered like the
 * recipe sort. + makes a new cookbook. With none yet, the empty state (issue #118), its button the same as +.
 */
export default function CookbooksPage({ f7router }: Props) {
  const { recipes, loading: recipesLoading, settings, setCookbookView } = useStore();
  const asList = settings.cookbookView === 'list';
  const { cookbooks, loading: booksLoading, loadError, reload, saveCookbook } = useCookbooks();
  // issue #35: a cookbook's card counts its recipes, so the page waits for both (placeholders meanwhile, not "0 recipes")
  const loading = (booksLoading || recipesLoading) && !loadError;
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const sorted = [...cookbooks].sort(byName);
  // no cookbooks (issue #118): only the title and + stay; the count and the tiles/list switch go until there's one
  const empty = !loading && !loadError && sorted.length === 0;
  const add = () => promptNewCookbook((id) => f7router?.navigate(`/cookbook/${id}/`), saveCookbook);
  const about = (c: Cookbook) => {
    const ids = cookbookRecipeIds(c);
    const n = existing(ids, byId).length;
    const meta = [`${n} ${n === 1 ? 'recipe' : 'recipes'}`, c.sections.length ? `${c.sections.length} ${c.sections.length === 1 ? 'section' : 'sections'}` : ''];
    return { meta: meta.filter(Boolean).join(' · '), photos: platePhotos(c, byId) };
  };

  return (
    <Page name="cookbooks" onPageAfterIn={showTabbar}>
      {/* issue #85: back to tucked-away cook mode; part of the page, so it slides with it */}
      <CookingFab slot="fixed" />
      <Navbar key="navbar" className="ck-navbar-root">
        <NavTitle>Cookbooks</NavTitle>
        <NavRight>
          <Link iconOnly onClick={add} aria-label="New cookbook" className="ck-nav-primary">
            <Plus {...navIcon} />
          </Link>
          {/* shows the other view: the list icon while tiles show, the grid icon while the list shows */}
          {!empty && (
            <Link iconOnly onClick={() => setCookbookView(asList ? 'grid' : 'list')} aria-label={asList ? 'Show as tiles' : 'Show as a list'} className="ck-view-switch">
              {asList ? <LayoutGrid {...navIcon} /> : <ListIcon {...navIcon} />}
            </Link>
          )}
        </NavRight>
      </Navbar>

      {/* keys: Page leaves out the blocks that aren't shown and lists the rest by position (see RecipesPage) */}
      {(loading || sorted.length > 0) && (
        <Block key="count" className="ck-count">
          {loading ? <CountSkeleton text="6 cookbooks" /> : <span className="ck-note">{sorted.length === 1 ? '1 cookbook' : `${sorted.length} cookbooks`}</span>}
          {/* temporary, issue #141: deploy previews only (see headerReport.ts) */}
          {headerReportOn && (
            <Link className="ck-report-link" onClick={(e: { target: EventTarget | null }) => reportHeader((e.target as Element | null)?.closest('.page') ?? null)}>
              Copy report (#141{photosOff ? ' · no photos' : ''})
            </Link>
          )}
        </Block>
      )}
      {loading && !asList && <CookbookGridSkeleton key="grid-loading" />}
      {loading && asList && <CookbookListSkeleton key="list-loading" />}
      {loadError && (
        <Block key="error" className="ck-list-state">
          <p className="ck-note">Couldn’t load your cookbooks. {loadError}</p>
          <Button round className="ck-soft ck-inline-button" onClick={() => reload()}>
            Try again
          </Button>
        </Block>
      )}
      {empty && (
        <EmptyState
          key="empty"
          icon={BookHeart}
          title="No cookbooks yet"
          text="Gather your recipes into cookbooks."
          action={{ label: 'New cookbook', onClick: add }}
        />
      )}
      {!loading && !asList && sorted.length > 0 && (
        <Block key="grid" className="ck-card-grid ck-book-grid">
          <div className="grid grid-cols-2 grid-gap">
            {sorted.map((c) => {
              const { meta, photos } = about(c);
              return <CookbookTile key={c.id} href={`/cookbook/${c.id}/`} name={c.name} meta={meta} color={colorOf(c)} photos={photos} />;
            })}
          </div>
        </Block>
      )}
      {!loading && asList && sorted.length > 0 && (
        <List key="list" strongIos insetIos dividersIos className="ck-book-list">
          {sorted.map((c) => {
            const { meta, photos } = about(c);
            return (
              <ListItem key={c.id} link={`/cookbook/${c.id}/`} title={c.name} footer={meta}>
                <span slot="media">
                  <CookbookThumb color={colorOf(c)} photo={photos[0]} />
                </span>
              </ListItem>
            );
          })}
        </List>
      )}
    </Page>
  );
}
