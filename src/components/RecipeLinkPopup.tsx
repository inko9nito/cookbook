import { Popup, Page, Navbar, NavRight, Link, Searchbar, List, ListItem } from 'framework7-react';
import type { Recipe } from '../lib/recipe';

type Props = {
  opened: boolean;
  /** the recipes it can link to: every other recipe, A–Z */
  recipes: Recipe[];
  /** the recipe linked now, if any */
  current?: string;
  /** a recipe (or None) was picked: the parent links it and sets `opened` to false */
  onPick: (recipeId: string | undefined) => void;
  onClosed: () => void;
};

/**
 * Issue #11: pick the recipe an ingredient is made from (a sauce, a pie crust). A full-screen Framework7 popup with a
 * search bar, "None" to unlink, and the recipes A–Z as radio rows; picking one closes it.
 * It's opened from the ingredient sheet, which closes first: Framework7 stacks sheets above popups.
 */
export default function RecipeLinkPopup({ opened, recipes, current, onPick, onClosed }: Props) {
  return (
    <Popup className="ck-link-popup" opened={opened} onPopupClosed={onClosed} swipeToClose>
      <Page>
        <Navbar title="Link a Recipe">
          <NavRight>
            <Link popupClose>Cancel</Link>
          </NavRight>
        </Navbar>
        <div className="ck-link-search">
          <Searchbar searchContainer=".ck-link-list" searchIn=".item-title" placeholder="Search recipes" disableButton={false} />
        </div>
        <List strongIos insetIos dividersIos className="ck-convert-list searchbar-hide-on-search">
          <ListItem radio radioIcon="start" name="ck-link" title="None" checked={!current} onChange={() => onPick(undefined)} />
        </List>
        <List strongIos insetIos className="searchbar-not-found">
          <ListItem title="No recipes found" />
        </List>
        <List strongIos insetIos dividersIos className="ck-convert-list ck-link-list searchbar-found">
          {recipes.map((r) => (
            <ListItem key={r.id} radio radioIcon="start" name="ck-link" title={r.title} checked={current === r.id} onChange={() => onPick(r.id)} />
          ))}
        </List>
      </Page>
    </Popup>
  );
}
