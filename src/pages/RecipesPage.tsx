import { useState } from 'react';
import {
  Page, Navbar, NavTitle, NavRight, Link, Searchbar,
  Block, BlockFooter, Chip, Actions, ActionsGroup, ActionsLabel, ActionsButton,
} from 'framework7-react';
import { Settings, ArrowUpDown, Plus } from 'lucide-react';
import { useStore, type SortKey } from '../demo/store';
import { navIcon } from '../components/ui/icons';
import { showTabbar } from '../components/ui/tabbar';
import RecipeCard from '../components/ui/RecipeCard';

const SORT_LABELS: Record<SortKey, string> = { newest: 'Newest first', oldest: 'Oldest first', az: 'A–Z' };
const TAGS = ['dinner', 'side', 'dessert', 'quick'];
const label = (t: string) => t[0].toUpperCase() + t.slice(1);

type Props = { f7router?: { navigate: (url: string) => void } };

export default function RecipesPage({ f7router }: Props) {
  const { recipes, sort, setSort } = useStore();
  const [sortOpen, setSortOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);

  const shown = recipes
    .filter((r) => tags.every((t) => r.tags.includes(t)))
    .sort((a, b) =>
      sort === 'az'
        ? a.title.localeCompare(b.title)
        : sort === 'newest'
          ? b.createdAt.localeCompare(a.createdAt)
          : a.createdAt.localeCompare(b.createdAt),
    );
  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <Page name="recipes" onPageAfterIn={showTabbar}>
      <Navbar className="ck-navbar-root">
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

      {/* RED: the search bar is part of the page and scrolls with it (wrapped, so Framework7 keeps it in the page content instead of pinning it) */}
      <div className="ck-home-search">
        <Searchbar searchContainer=".ck-card-grid" searchItem=".ck-card" searchIn=".ck-card-title" placeholder="Search recipes" disableButton={false} />
      </div>

      <Block className="ck-chips ck-chips-scroll">
        <Chip text="All" className={`ck-chip ${tags.length === 0 ? 'ck-chip-on' : ''}`} onClick={() => setTags([])} />
        {TAGS.map((t) => (
          <Chip key={t} text={label(t)} className={`ck-chip ${tags.includes(t) ? 'ck-chip-on' : ''}`} onClick={() => toggleTag(t)} />
        ))}
      </Block>

      <Block className="ck-count">
        <span className="ck-note">
          {shown.length} {shown.length === 1 ? 'recipe' : 'recipes'} · {SORT_LABELS[sort]}
        </span>
      </Block>
      <BlockFooter className="searchbar-not-found">No recipes found</BlockFooter>
      {/* Prepear's grid: two cards per row */}
      <Block className="ck-card-grid searchbar-found">
        <div className="grid grid-cols-2 grid-gap">
          {shown.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      </Block>

      <Actions opened={sortOpen} onActionsClosed={() => setSortOpen(false)}>
        <ActionsGroup>
          <ActionsLabel>Sort recipes</ActionsLabel>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <ActionsButton key={k} strong={k === sort} onClick={() => setSort(k)}>
              {SORT_LABELS[k]}
            </ActionsButton>
          ))}
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton strong>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>
    </Page>
  );
}
