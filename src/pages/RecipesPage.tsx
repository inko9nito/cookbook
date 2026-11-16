import { useState } from 'react';
import {
  Page, Navbar, NavTitle, NavRight, Link, Searchbar,
  Block, BlockFooter, Chip, Actions, ActionsGroup, ActionsLabel, ActionsButton, Button, Preloader,
} from 'framework7-react';
import { Settings, ArrowUpDown, Plus } from 'lucide-react';
import { useStore, type SortKey } from '../data/store';
import { COURSES } from '../lib/recipe';
import { navIcon } from '../components/ui/icons';
import { showTabbar } from '../components/ui/tabbar';
import RecipeCard from '../components/ui/RecipeCard';
import { searchByTitle, searchWords } from '../lib/search';

const SORT_LABELS: Record<SortKey, string> = { newest: 'Newest first', oldest: 'Oldest first', az: 'A–Z' };
const label = (t: string) => t[0].toUpperCase() + t.slice(1);

type Props = { f7router?: { navigate: (url: string) => void } };

export default function RecipesPage({ f7router }: Props) {
  const { recipes, loading, loadError, reload, sort, setSort, settings, setFilter } = useStore();
  const [sortOpen, setSortOpen] = useState(false);
  const [query, setQuery] = useState('');

  // R2: a chip for every tag in use, the course types first (in meal order), then the rest A–Z
  const used = new Set(recipes.flatMap((r) => r.tags));
  const allTags = [...COURSES.filter((t) => used.has(t)), ...[...used].filter((t) => !COURSES.includes(t)).sort()];
  // the remembered filter, minus tags no recipe has any more
  const tags = settings.filterTags.filter((t) => used.has(t));
  const matchAny = settings.filterMode === 'any';

  const shown = recipes
    .filter((r) => !tags.length || (matchAny ? tags.some((t) => r.tags.includes(t)) : tags.every((t) => r.tags.includes(t))))
    .sort((a, b) =>
      sort === 'az'
        ? a.title.localeCompare(b.title)
        : sort === 'newest'
          ? b.createdAt.localeCompare(a.createdAt)
          : a.createdAt.localeCompare(b.createdAt),
    );
  // search: titles with every word typed, among the recipes the chips show
  const words = searchWords(query);
  const found = searchByTitle(shown, words);
  const toggleTag = (t: string) => setFilter(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);

  return (
    <Page name="recipes" onPageAfterIn={showTabbar}>
      <Navbar key="navbar" className="ck-navbar-root">
        <NavTitle>Recipes</NavTitle>
        <NavRight>
          <Link iconOnly onClick={() => f7router?.navigate('/recipe/new/')} aria-label="New recipe">
            <Plus {...navIcon} />
          </Link>
          <Link iconOnly onClick={() => setSortOpen(true)} aria-label="Sort recipes">
            <ArrowUpDown {...navIcon} />
          </Link>
          <Link iconOnly href="/settings/" aria-label="Settings">
            <Settings {...navIcon} />
          </Link>
        </NavRight>
      </Navbar>

      {/* RED: the search bar is part of the page and scrolls with it (wrapped, so Framework7 keeps it in the page content instead of pinning it).
          customSearch: it only says what's typed, and the page filters (so the count can say "6 of 240", and chips
          tapped mid-search filter too). No backdrop: the user wants no overlay while searching.
          Every block here has a key: Page drops the ones that aren't shown (loading, error) and lists the rest by
          position, so without keys React rebuilds the blocks below whenever loading ends. */}
      <div key="search" className="ck-home-search">
        <Searchbar
          customSearch
          backdrop={false}
          disableButton={false}
          placeholder="Search recipes"
          onSearchbarSearch={(_sb, q) => setQuery(String(q ?? ''))}
          onSearchbarClear={() => setQuery('')}
        />
      </div>

      <Block key="chips" className="ck-chips ck-chips-scroll">
        <Chip text="All" className={`ck-chip ${tags.length === 0 ? 'ck-chip-on' : ''}`} onClick={() => setFilter([])} />
        {allTags.map((t) => (
          <Chip key={t} text={label(t)} className={`ck-chip ${tags.includes(t) ? 'ck-chip-on' : ''}`} onClick={() => toggleTag(t)} />
        ))}
      </Block>

      <Block key="count" className="ck-count">
        <span className="ck-note">
          {words.length ? `${found.length} of ${shown.length}` : shown.length} {shown.length === 1 ? 'recipe' : 'recipes'} · {SORT_LABELS[sort]}
          {tags.length > 1 && (matchAny ? ' · any tag' : ' · all tags')}
        </span>
      </Block>
      {loading && (
        <Block key="loading" className="ck-list-state">
          <Preloader />
        </Block>
      )}
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

      <Actions key="sort" opened={sortOpen} onActionsClosed={() => setSortOpen(false)}>
        <ActionsGroup>
          <ActionsLabel>Sort recipes</ActionsLabel>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <ActionsButton key={k} strong={k === sort} onClick={() => setSort(k)}>
              {SORT_LABELS[k]}
            </ActionsButton>
          ))}
        </ActionsGroup>
        {tags.length > 1 && (
          <ActionsGroup>
            <ActionsLabel>With more than one tag picked, show recipes with</ActionsLabel>
            <ActionsButton strong={!matchAny} onClick={() => setFilter(tags, 'all')}>
              All the tags
            </ActionsButton>
            <ActionsButton strong={matchAny} onClick={() => setFilter(tags, 'any')}>
              Any of the tags
            </ActionsButton>
          </ActionsGroup>
        )}
        <ActionsGroup>
          <ActionsButton strong>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>
    </Page>
  );
}
