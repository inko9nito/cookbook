import { useState } from 'react';
import {
  Page, Navbar, NavTitle, NavRight, Link, Searchbar,
  List, ListItem, Block, BlockTitle, Chip, Actions, ActionsGroup, ActionsLabel, ActionsButton,
} from 'framework7-react';
import { Settings, ArrowUpDown, Plus } from 'lucide-react';
import { useStore, type SortKey } from '../demo/store';
import { navIcon } from '../components/ui/icons';
import FeaturedRecipeCard, { formatMinutes } from '../components/ui/FeaturedRecipeCard';
import { photoStyle } from '../components/ui/photo';

const SORT_LABELS: Record<SortKey, string> = { newest: 'Newest first', oldest: 'Oldest first', az: 'A–Z' };
const TAGS = ['dinner', 'side', 'dessert', 'quick'];
const label = (t: string) => t[0].toUpperCase() + t.slice(1);

export default function RecipesPage() {
  const { recipes, sort, setSort, openEditor } = useStore();
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
  const newest = [...recipes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <Page name="recipes">
      <Navbar className="ck-navbar-root">
        <NavTitle>Recipes</NavTitle>
        <NavRight>
          <Link iconOnly onClick={() => setSortOpen(true)} aria-label="Sort recipes">
            <ArrowUpDown {...navIcon} />
          </Link>
          <Link iconOnly onClick={() => openEditor()} aria-label="New recipe">
            <Plus {...navIcon} />
          </Link>
          <Link iconOnly href="/settings/" aria-label="Settings">
            <Settings {...navIcon} />
          </Link>
        </NavRight>
      </Navbar>

      {/* RED: the search bar is part of the page and scrolls with it (wrapped, so Framework7 keeps it in the page content instead of pinning it) */}
      <div>
        <Searchbar searchContainer=".ck-recipes" searchIn=".item-title" placeholder="Search recipes" disableButton={false} />
      </div>

      <Block className="ck-chips">
        <Chip text="All" className={`ck-chip ${tags.length === 0 ? 'ck-chip-on' : ''}`} onClick={() => setTags([])} />
        {TAGS.map((t) => (
          <Chip key={t} text={label(t)} className={`ck-chip ${tags.includes(t) ? 'ck-chip-on' : ''}`} onClick={() => toggleTag(t)} />
        ))}
      </Block>

      {newest && tags.length === 0 && (
        <>
          <BlockTitle medium>Recently added</BlockTitle>
          <Block>
            <FeaturedRecipeCard recipe={newest} />
          </Block>
        </>
      )}

      <BlockTitle medium>
        All recipes <span className="ck-note" style={{ fontWeight: 400, float: 'right', marginTop: 6 }}>{SORT_LABELS[sort]}</span>
      </BlockTitle>
      <List className="searchbar-not-found">
        <ListItem title="No recipes found" />
      </List>
      <List mediaList className="ck-recipes searchbar-found">
        {shown.map((r) => (
          <ListItem key={r.id} link={`/recipe/${r.id}/`} noChevron title={r.title} text={`${formatMinutes(r.minutes)} · Serves ${r.servings} · ${r.tags.map(label).join(', ')}`}>
            <span slot="media" className="ck-thumb ck-photo" data-tone={r.tone} style={photoStyle(r.photo)} role="img" aria-label={r.title} />
          </ListItem>
        ))}
      </List>

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
