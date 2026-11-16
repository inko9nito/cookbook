import { Popup, Page, Navbar, NavTitle, NavRight, Link, List, ListItem, f7 } from 'framework7-react';
import { BookOpen, Plus } from 'lucide-react';
import { useCookbooks, useStore } from '../data/store';
import { byName, cookbookRecipeIds, coverOf, coversOf, emptyCookbook, isIn, placeName, toggleIn, type Cookbook } from '../lib/cookbook';
import { newId, type Recipe } from '../lib/recipe';
import { inlineIcon } from './ui/icons';
import { photoStyle } from './ui/photo';
import { say } from './ui/toast';

type Props = { opened: boolean; recipe: Recipe; onClosed: () => void };

/**
 * Add to Cookbook (issue #25), from a recipe's ⋯ menu: a Framework7 popup listing every cookbook A–Z with a check box.
 * A cookbook with sections lists them under its name (and Uncategorized first), each with its own box, since a recipe
 * can be in several. Ticking adds the recipe at once and unticking takes it out, each with a toast; Done closes. "New Cookbook" at the
 * top makes one with this recipe in it.
 */
export default function AddToCookbookPopup({ opened, recipe, onClosed }: Props) {
  const { recipes } = useStore();
  const { cookbooks, saveCookbook } = useCookbooks();
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const sorted = [...cookbooks].sort(byName);

  const newCookbook = () =>
    f7.dialog.prompt('It starts with this recipe in it.', 'New Cookbook', (name: string) => {
      if (!name.trim()) return;
      const c = { ...emptyCookbook(name, newId), recipeIds: [recipe.id] };
      saveCookbook(c);
      say(`Added to ${c.name}`);
    });

  // ticking or unticking saves at once, and a toast says where it went
  const toggle = (c: Cookbook, sectionId: string | null, on: boolean) => {
    saveCookbook(toggleIn(c, sectionId, recipe.id, on));
    say(`${on ? 'Added to' : 'Taken out of'} ${placeName(c, sectionId)}`);
  };

  const thumb = (cover?: string) => (
    <span slot="media" className={`ck-picker-thumb ck-photo${cover ? '' : ' ck-photo-empty'}`} style={photoStyle(cover)} aria-hidden="true">
      {!cover && <BookOpen size={16} strokeWidth={1.5} />}
    </span>
  );

  return (
    <Popup className="ck-link-popup ck-addto-popup" opened={opened} onPopupClosed={onClosed} push swipeToClose="to-bottom" swipeHandler=".navbar">
      <Page>
        <Navbar innerClassName="navbar-inner-centered-title">
          <NavTitle>Add to Cookbook</NavTitle>
          <NavRight>
            <Link popupClose className="ck-nav-primary">
              Done
            </Link>
          </NavRight>
        </Navbar>
        <List strongIos insetIos dividersIos className="ck-addto-new">
          <ListItem link="#" noChevron title="New Cookbook" onClick={newCookbook} className="ck-copy-row">
            <Plus slot="media" {...inlineIcon} className="ck-icon ck-copy" aria-hidden="true" />
          </ListItem>
        </List>
        {sorted.length > 0 && (
          <List strongIos insetIos dividersIos className="ck-convert-list ck-addto-list">
            {/* one flat list of rows (Framework7's List moves anything that isn't a row, like a fragment, to its end) */}
            {sorted.flatMap((c) => {
              const cover = coverOf(coversOf(c)[0], cookbookRecipeIds(c), byId);
              if (!c.sections.length) {
                return [
                  <ListItem
                    key={c.id}
                    checkbox
                    checked={isIn(c, null, recipe.id)}
                    onChange={(e: { target: { checked: boolean } }) => toggle(c, null, e.target.checked)}
                    title={c.name}
                  >
                    {thumb(cover)}
                  </ListItem>,
                ];
              }
              return [
                <ListItem key={c.id} className="ck-addto-book" title={c.name}>
                  {thumb(cover)}
                </ListItem>,
                ...[{ id: null, name: 'Uncategorized' }, ...c.sections].map((s) => (
                  <ListItem
                    key={`${c.id}:${s.id ?? ''}`}
                    className="ck-addto-section"
                    checkbox
                    checked={isIn(c, s.id, recipe.id)}
                    onChange={(e: { target: { checked: boolean } }) => toggle(c, s.id, e.target.checked)}
                    title={s.name}
                  />
                )),
              ];
            })}
          </List>
        )}
      </Page>
    </Popup>
  );
}
