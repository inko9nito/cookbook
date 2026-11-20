import { useRef, useState } from 'react';
import {
  Page, Navbar, NavTitle, NavRight, Subnavbar, Link, Searchbar,
  Block, BlockFooter, Chip, Button,
} from 'framework7-react';
import { ArrowUpDown, Plus, Soup, Link2, Camera, PenLine } from 'lucide-react';
import Menu from '../components/ui/Menu';
import { useAccount, useStore } from '../data/store';
import { COURSES, SORT_LABELS, SortKey, sortRecipes } from '../lib/recipe';
import { navIcon } from '../components/ui/icons';
import { showTabbar } from '../components/ui/tabbar';
import { useAtTop } from '../components/ui/atTop';
import RecipeCard from '../components/ui/RecipeCard';
import { ChipsSkeleton, CountSkeleton, RecipeGridSkeleton } from '../components/ui/Skeletons';
import { searchByTitle, searchWords } from '../lib/search';
import { MAX_READ_IMAGES } from '../lib/read-recipe';
import CookingFab from '../components/CookingFab';
import EmptyState from '../components/ui/EmptyState';
import FromLinkPopup, { openFromLink } from '../components/FromLinkPopup';

const label = (t: string) => t[0].toUpperCase() + t.slice(1);

type Props = { f7router?: { navigate: (url: string, options?: { props?: Record<string, unknown> }) => void } };

export default function RecipesPage({ f7router }: Props) {
  const { recipes, loading, loadError, reload, sort, setSort, settings, setFilter } = useStore();
  const [sortOpen, setSortOpen] = useState(false);
  // issue #17: + asks how: from a link (#15), from photos or screenshots (picked here, read in the editor), or type it in
  const [newOpen, setNewOpen] = useState(false);
  // issue #146: reading recipes uses Claude, which only the admin's cookbook has; anyone else's + goes straight to typing
  const { admin } = useAccount();
  const startNew = () => (admin ? setNewOpen(true) : f7router?.navigate('/recipe/new/'));
  const scanRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  // issue #99: the search bar's line and shadow show only once the recipes have scrolled
  const { atTop, onPageInit } = useAtTop();

  // issue #15: + → From a link opens its own screen (FromLinkPopup): paste the copied link there, or type one in
  const readLink = (url: string) => f7router?.navigate('/recipe/new/', { props: { scanUrl: url } });

  // R2: a chip for every tag in use, the course types first (in meal order), then the rest A–Z
  const used = new Set(recipes.flatMap((r) => r.tags));
  const allTags = [...COURSES.filter((t) => used.has(t)), ...[...used].filter((t) => !COURSES.includes(t)).sort()];
  // the remembered filter, minus tags no recipe has any more
  const tags = settings.filterTags.filter((t) => used.has(t));
  const matchAny = settings.filterMode === 'any';

  const shown = sortRecipes(
    recipes.filter((r) => !tags.length || (matchAny ? tags.some((t) => r.tags.includes(t)) : tags.every((t) => r.tags.includes(t)))),
    sort,
  );
  // search: titles with every word typed, among the recipes the chips show
  const words = searchWords(query);
  const found = searchByTitle(shown, words);
  const toggleTag = (t: string) => setFilter(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);
  // no recipes at all (issue #118): only the title and + stay; search, chips, the count and sort go until there's one
  const empty = !loading && !loadError && !recipes.length;

  return (
    // the title row slides away while scrolling down and comes back on scrolling up; the search bar and chips under it
    // stay (Framework7's hideNavbarOnScroll moves the navbar up by its own height, leaving the subnavbar showing)
    <Page
      name="recipes"
      className={`ck-recipes-page${loadError ? ' ck-no-chips' : ''}${atTop ? ' ck-at-top' : ''}`}
      hideNavbarOnScroll
      withSubnavbar={!empty}
      onPageInit={onPageInit}
      onPageAfterIn={showTabbar}
    >
      {/* issue #85: back to tucked-away cook mode; part of the page, so it slides with it */}
      <CookingFab slot="fixed" />
      <Navbar key="navbar" className="ck-navbar-root">
        <NavTitle>Recipes</NavTitle>
        <NavRight>
          {/* issue #27: the plus is the screen's main action, a filled Tomato button */}
          <Link iconOnly onClick={startNew} aria-label="New recipe" className="ck-nav-primary">
            <Plus {...navIcon} />
          </Link>
          {!empty && (
            <Link iconOnly onClick={() => setSortOpen(true)} aria-label="Sort recipes">
              <ArrowUpDown {...navIcon} />
            </Link>
          )}
        </NavRight>
        {/* issue #63: the search bar and the tag chips stay under the title while the recipes scroll (Framework7's
            subnavbar, like the Planner's week strip), so searching or filtering never needs a scroll back up.
            customSearch: it only says what's typed, and the page filters (so the count can say "6 of 240", and chips
            tapped mid-search filter too). No backdrop: the user wants no overlay while searching. */}
        {!empty && (
          <Subnavbar className="ck-docked-bar ck-search-bar">
            <Searchbar
              customSearch
              backdrop={false}
              disableButton={false}
              placeholder="Search recipes"
              onSearchbarSearch={(_sb, q) => setQuery(String(q ?? ''))}
              onSearchbarClear={() => setQuery('')}
            />
            {/* issue #35: until the recipes arrive, grey placeholders stand in for the chips (no lone "All" chip); if they
                can't be loaded, there are no chips */}
            {!loadError && (
              <div className="ck-chips ck-chips-scroll">
                {loading ? (
                  <ChipsSkeleton />
                ) : (
                  <>
                    <Chip text="All" className={`ck-chip ${tags.length === 0 ? 'ck-chip-on' : ''}`} onClick={() => setFilter([])} />
                    {allTags.map((t) => (
                      <Chip key={t} text={label(t)} className={`ck-chip ${tags.includes(t) ? 'ck-chip-on' : ''}`} onClick={() => toggleTag(t)} />
                    ))}
                  </>
                )}
              </div>
            )}
          </Subnavbar>
        )}
      </Navbar>

      {/* Every block here has a key: Page drops the ones that aren't shown (loading, error) and lists the rest by
          position, so without keys React rebuilds the blocks below whenever loading ends. Until the recipes arrive, the
          count and the tiles are grey placeholders (issue #35, no "0 recipes"); if they can't be loaded, only the error
          shows. */}
      {empty && (
        <EmptyState
          key="empty"
          icon={Soup}
          title="No recipes yet"
          text={admin ? 'Add one from a link or a photo.' : 'Add your first one.'}
          action={{ label: 'New recipe', onClick: startNew }}
        />
      )}
      {!loadError && !empty && (
        <Block key="count" className="ck-count">
          {loading ? (
            <CountSkeleton />
          ) : (
            <span className="ck-note">
              {words.length ? `${found.length} of ${shown.length}` : shown.length} {shown.length === 1 ? 'recipe' : 'recipes'} · {SORT_LABELS[sort]}
              {tags.length > 1 && (matchAny ? ' · any tag' : ' · all tags')}
            </span>
          )}
        </Block>
      )}
      {loading && <RecipeGridSkeleton key="loading" />}
      {loadError && (
        <Block key="error" className="ck-list-state">
          <p className="ck-note">Couldn’t load your recipes. {loadError}</p>
          <Button round className="ck-soft ck-inline-button" onClick={() => reload()}>
            Try again
          </Button>
        </Block>
      )}
      {words.length > 0 && !found.length && (
        <BlockFooter key="not-found" className="ck-not-found">
          No recipes found
        </BlockFooter>
      )}
      {/* Prepear's grid: two cards per row */}
      <Block key="grid" className="ck-card-grid">
        <div className="grid grid-cols-2 grid-gap">
          {found.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      </Block>

      <Menu
        key="new-menu"
        opened={newOpen}
        onClosed={() => setNewOpen(false)}
        groups={[
          [
            // opened in the tap itself, so its field can be focused (iOS only raises the keyboard then)
            { label: 'From a link', icon: Link2, onClick: openFromLink },
            // the picker has to open in the tap itself (iOS only lets a tap open it)
            { label: 'From photos or screenshots', icon: Camera, onClick: () => scanRef.current?.click() },
            { label: 'Type it in', icon: PenLine, onClick: () => f7router?.navigate('/recipe/new/') },
          ],
        ]}
      />
      {/* iOS offers the photo library, the camera (a cookbook page) and files */}
      <FromLinkPopup key="from-link" onImport={readLink} onOpenRecipe={(id) => f7router?.navigate(`/recipe/${id}/`)} />
      <input
        key="scan-input"
        ref={scanRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])].slice(0, MAX_READ_IMAGES);
          e.target.value = ''; // picking the same photo again still fires
          if (files.length) f7router?.navigate('/recipe/new/', { props: { scanFiles: files } });
        }}
      />

      <Menu
        key="sort-menu"
        opened={sortOpen}
        onClosed={() => setSortOpen(false)}
        groups={[
          SortKey.options.map((k) => ({ label: SORT_LABELS[k], checked: k === sort, onClick: () => setSort(k) })),
          tags.length > 1
            ? [
                { label: 'Recipes with all the tags', checked: !matchAny, onClick: () => setFilter(tags, 'all') },
                { label: 'Recipes with any of the tags', checked: matchAny, onClick: () => setFilter(tags, 'any') },
              ]
            : [],
        ]}
      />
    </Page>
  );
}
