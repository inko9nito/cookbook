import { useEffect, useState } from 'react';
import { Popup, Page, Navbar, NavLeft, NavTitle, NavRight, Link, List, ListItem, AccordionContent, f7 } from 'framework7-react';
import { BookOpen, Plus } from 'lucide-react';
import { useCookbooks, useStore } from '../data/store';
import { byName, emptyCookbook, platePhotos, isIn, recipeIdsOf, toggleIn, withRecipeIds, type Cookbook } from '../lib/cookbook';
import { newId, type Recipe } from '../lib/recipe';
import { inlineIcon } from './ui/icons';
import { photoStyle } from './ui/photo';

type Props = { opened: boolean; recipe: Recipe; onClosed: () => void };

/**
 * Add to Cookbook (issue #25), from a recipe's ⋯ menu: a Framework7 popup listing every cookbook A–Z with a check box.
 * A cookbook with sections is a Framework7 accordion row (issue #83: all of them open made the list very long): tapping it
 * opens its sections under it (Uncategorized first), each with its own box, since a recipe can be in several; closed, a
 * muted line under its name says which ones it's in. All start closed each time. Nothing changes until Done: ticks, unticks and a "New Cookbook" (it starts with this recipe in it)
 * are kept here, then Done saves the cookbooks that changed. Cancel, or swiping the popup away, leaves everything as it
 * was.
 */
export default function AddToCookbookPopup({ opened, recipe, onClosed }: Props) {
  const { recipes } = useStore();
  const { cookbooks, saveCookbook } = useCookbooks();
  const byId = new Map(recipes.map((r) => [r.id, r]));
  // the cookbooks as ticked here (by id), and the ones made here
  const [changed, setChanged] = useState<Map<string, Cookbook>>(new Map());
  const [made, setMade] = useState<Cookbook[]>([]);
  // a fresh list each time it opens, so every cookbook starts closed (Framework7 keeps the open ones in the DOM)
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!opened) return;
    setChanged(new Map());
    setMade([]);
    setRound((n) => n + 1);
  }, [opened]);

  const original = (id: string) => cookbooks.find((c) => c.id === id);
  const sorted = [...cookbooks.map((c) => changed.get(c.id) ?? c), ...made].sort(byName);

  const newCookbook = () =>
    f7.dialog.prompt('It starts with this recipe in it.', 'New Cookbook', (name: string) => {
      if (!name.trim()) return;
      setMade((m) => [...m, { ...emptyCookbook(name, newId), recipeIds: [recipe.id] }]);
    });

  const toggle = (c: Cookbook, sectionId: string | null, on: boolean) => {
    let next = toggleIn(c, sectionId, recipe.id, on);
    // ticked again where it was: back in its old spot, not at the end
    const was = original(c.id);
    if (was && on && isIn(was, sectionId, recipe.id)) next = withRecipeIds(next, sectionId, recipeIdsOf(was, sectionId));
    if (made.some((m) => m.id === c.id)) setMade((ms) => ms.map((m) => (m.id === c.id ? next : m)));
    else setChanged((m) => new Map(m).set(c.id, next));
  };

  const done = () => {
    const edits = [...changed.values()].filter((c) => JSON.stringify(c) !== JSON.stringify(original(c.id)));
    for (const c of [...edits, ...made]) saveCookbook(c);
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
          <NavLeft>
            <Link popupClose>Cancel</Link>
          </NavLeft>
          <NavTitle>Add to Cookbook</NavTitle>
          <NavRight>
            <Link popupClose onClick={done} className="ck-nav-primary">
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
          <List key={round} strongIos insetIos dividersIos className="ck-convert-list ck-addto-list">
            {/* one flat list of rows (Framework7's List moves anything that isn't a row, like a fragment, to its end) */}
            {sorted.flatMap((c) => {
              const cover = platePhotos(c, byId)[0];
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
              const sections = [{ id: null, name: 'Uncategorized' }, ...c.sections];
              const inSections = sections.filter((s) => isIn(c, s.id, recipe.id)).map((s) => s.name);
              return [
                <ListItem key={c.id} accordionItem className="ck-addto-book" title={c.name} footer={inSections.length ? `In ${inSections.join(', ')}` : undefined}>
                  {thumb(cover)}
                  <AccordionContent>
                    <List dividersIos className="ck-addto-sections">
                      {sections.map((s) => (
                        <ListItem
                          key={s.id ?? ''}
                          className="ck-addto-section"
                          checkbox
                          checked={isIn(c, s.id, recipe.id)}
                          onChange={(e: { target: { checked: boolean } }) => toggle(c, s.id, e.target.checked)}
                          title={s.name}
                        />
                      ))}
                    </List>
                  </AccordionContent>
                </ListItem>,
              ];
            })}
          </List>
        )}
      </Page>
    </Popup>
  );
}
