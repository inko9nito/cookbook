import { useEffect, useState } from 'react';
import { Popup, Page, Navbar, NavLeft, NavTitle, NavRight, Link, List, ListItem, SwipeoutActions, SwipeoutButton, Block } from 'framework7-react';
import { ChefHat } from 'lucide-react';
import { fromOrganizeRows, organizeRows, type Cookbook, type OrganizeRow } from '../lib/cookbook';
import { coverPhoto, type Recipe } from '../lib/recipe';
import { photoStyle } from './ui/photo';

type Props = {
  opened: boolean;
  cookbook: Cookbook;
  recipes: Map<string, Recipe>;
  /** Done: the cookbook as organized */
  onDone: (c: Cookbook) => void;
  onClosed: () => void;
};

const move = <T,>(list: T[], from: number, to: number) => {
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
};

/**
 * Organize a cookbook (issue #25): one Framework7 sortable list, like the recipe editor's. The Uncategorized recipes
 * come first, then each section as a heading row with its recipes. Dragging a recipe (by its handle, or a long press)
 * reorders it, and dropping it under another heading moves it to that section; dragging a heading moves the section.
 * Swipe a recipe to take it out of the cookbook (it stays in Recipes). Nothing is saved until Done.
 */
export default function OrganizePopup({ opened, cookbook, recipes, onDone, onClosed }: Props) {
  const [rows, setRows] = useState<OrganizeRow[]>([]);
  const [round, setRound] = useState(0);
  const hasSections = cookbook.sections.length > 0;

  const start = () => {
    // recipes deleted since drop out; without sections there's no Uncategorized heading to show
    const all = organizeRows(cookbook).filter((r) => (r.kind === 'recipe' ? recipes.has(r.recipeId) : hasSections || r.sectionId !== null));
    setRows(all);
    setRound((n) => n + 1);
  };
  useEffect(() => {
    if (opened) start();
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps
  const sectionName = (id: string | null) => (id === null ? 'Uncategorized' : (cookbook.sections.find((s) => s.id === id)?.name ?? ''));

  return (
    <Popup className="ck-link-popup ck-organize-popup" opened={opened} onPopupClosed={onClosed} push swipeToClose="to-bottom" swipeHandler=".navbar">
      <Page key={round}>
        <Navbar innerClassName="navbar-inner-centered-title">
          <NavLeft>
            <Link popupClose>Cancel</Link>
          </NavLeft>
          <NavTitle>Organize</NavTitle>
          <NavRight>
            <Link className="ck-nav-primary" onClick={() => onDone(fromOrganizeRows(cookbook, rows))}>
              Done
            </Link>
          </NavRight>
        </Navbar>
        <Block className="ck-note ck-organize-hint">
          <p>{hasSections ? 'Drag a recipe to reorder it or move it to another section. Swipe left to take it out.' : 'Drag a recipe to reorder it. Swipe left to take it out.'}</p>
        </Block>
        <List
          className="ck-edit-list ck-organize-list"
          strong
          inset
          dividers
          sortable
          sortableEnabled
          sortableTapHold
          onSortableSort={(data: { from: number; to: number }) => setRows((r) => move(r, data.from, data.to))}
        >
          {rows.map((row) =>
            row.kind === 'heading' ? (
              <ListItem
                key={row.key}
                // Uncategorized is always first: no handle (moving it changes nothing)
                className={`ck-group-row ck-organize-heading${row.sectionId === null ? ' ck-organize-fixed' : ''}`}
                title={sectionName(row.sectionId)}
              />
            ) : (
              <ListItem key={row.key} swipeout title={recipes.get(row.recipeId)?.title} onSwipeoutDeleted={() => setRows((r) => r.filter((x) => x.key !== row.key))}>
                <span
                  slot="media"
                  className={`ck-picker-thumb ck-photo${coverPhoto(recipes.get(row.recipeId)!) ? '' : ' ck-photo-empty'}`}
                  style={photoStyle(coverPhoto(recipes.get(row.recipeId)!))}
                  aria-hidden="true"
                >
                  {!coverPhoto(recipes.get(row.recipeId)!) && <ChefHat size={16} strokeWidth={1.5} />}
                </span>
                <SwipeoutActions right>
                  <SwipeoutButton delete>Remove</SwipeoutButton>
                </SwipeoutActions>
              </ListItem>
            ),
          )}
        </List>
      </Page>
    </Popup>
  );
}
