import { useState } from 'react';
import {
  Page, Navbar, NavTitle, NavTitleLarge, NavRight, Link, Subnavbar, Searchbar,
  List, ListItem, Block, Chip, Actions, ActionsGroup, ActionsLabel, ActionsButton,
} from 'framework7-react';
import { useStore, type SortKey } from '../demo/store';

const SORT_LABELS: Record<SortKey, string> = { newest: 'Newest first', oldest: 'Oldest first', az: 'A–Z' };
const TAGS = ['dinner', 'soup', 'side', 'dessert', 'drink'];

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

  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <Page name="recipes">
      <Navbar large>
        <NavTitle>Recipes</NavTitle>
        <NavRight>
          <Link iconF7="arrow_up_arrow_down" onClick={() => setSortOpen(true)} />
          <Link iconF7="plus" onClick={() => openEditor()} />
        </NavRight>
        <NavTitleLarge>Recipes</NavTitleLarge>
        <Subnavbar inner={false}>
          <Searchbar searchContainer=".recipe-list" searchIn=".item-title" placeholder="Search recipes" disableButtonText="Cancel" />
        </Subnavbar>
      </Navbar>

      <Block className="demo-banner">
        Sorted: {SORT_LABELS[sort]} (remembered). Tap tags to filter:
        <div>
          {TAGS.map((t) => (
            <Chip key={t} text={t} outline={!tags.includes(t)} color={tags.includes(t) ? 'primary' : undefined} onClick={() => toggleTag(t)} />
          ))}
        </div>
      </Block>

      <List className="searchbar-not-found" strongIos insetIos>
        <ListItem title="No recipes found" />
      </List>
      <List mediaList strongIos dividersIos insetIos className="recipe-list searchbar-found">
        {shown.map((r) => (
          <ListItem
            key={r.id}
            link={`/recipe/${r.id}/`}
            title={r.title}
            subtitle={r.source}
            text={`${r.minutes} min · serves ${r.servings} · ${r.tags.join(', ')}`}
          />
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
