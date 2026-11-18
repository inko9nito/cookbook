import { useState, type ReactNode } from 'react';
import {
  Page, Navbar, NavTitle, NavRight, Link, Block, Button, Segmented, List, ListItem, SwipeoutActions, SwipeoutButton,
  Actions, ActionsGroup, ActionsLabel, ActionsButton, f7,
} from 'framework7-react';
import { ArrowUpRight, ChefHat, ChevronDown, Ellipsis, Plus } from 'lucide-react';
import { showTabbar } from '../components/ui/tabbar';
import { inlineIcon, navIcon } from '../components/ui/icons';
import { photoStyle } from '../components/ui/photo';
import { PlannerRowsSkeleton } from '../components/ui/Skeletons';
import CookingFab from '../components/CookingFab';
import RecipePickerPopup from '../components/RecipePickerPopup';
import { AddRecipeSheet, ShopWeekSheet } from '../components/AddGroceriesSheet';
import { useGroceries, usePlanner, useStore } from '../data/store';
import {
  AISLE_NAMES, AISLES, byAisle, byRecipe, countName, instacartSearch, linesOf, listText, nameKey, partAmount, type Aisle, type GroceryItem, type Line,
} from '../lib/groceries';
import { coverPhoto, newId, type Recipe } from '../lib/recipe';
import { dayName, mealName, today } from '../lib/planner';
import { friendly } from '../lib/ingredients';

const toast = (text: string) => f7.toast.show({ text, closeTimeout: 2200 });
const aToZ = (a: Recipe, b: Recipe) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

/**
 * The Groceries tab (issue #64): the grocery list, by aisle or by recipe (remembered). Things from several recipes are
 * added up into one line ("3 lemons"), each saying which recipes it's for. Tapping a row ticks it; its ↗ opens
 * Instacart's search for it at the store the list is shopping at (the pill at the top), or at the store it's pinned to.
 * Ticked lines go to Got it at the bottom (Clear takes them off). Swiping a row: Aisle (the app guessed wrong; kept for
 * that name), Store (pin it to another store), Delete. + adds Shop this week (the Planner's recipes), a recipe, or
 * something typed. ⋯ shares what's left as text, or clears the list.
 */
export default function GroceriesPage({ f7router }: { f7router?: { navigate: (url: string) => void } }) {
  const { recipes, settings, changeSettings, loading: recipesLoading } = useStore();
  const { items, loading: listLoading, loadError, reload, changeGroceries } = useGroceries();
  const { planned } = usePlanner();
  const [addMenu, setAddMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [storeMenu, setStoreMenu] = useState(false);
  const [pinning, setPinning] = useState<Line | null>(null);
  const [moving, setMoving] = useState<Line | null>(null);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState<Recipe | null>(null);
  const [shopWeek, setShopWeek] = useState(false);
  const loading = (recipesLoading || listLoading) && !loadError;

  const lines = linesOf(items, recipes, settings.groceryAisles);
  const toGet = lines.filter((l) => !l.checked);
  const got = lines.filter((l) => l.checked);
  const stores = settings.groceryStores;
  const store = stores.find((s) => s.slug === settings.groceryStore) ?? stores[0];
  const storeName = (slug?: string) => stores.find((s) => s.slug === slug)?.name ?? slug ?? '';
  const view = settings.groceryView;
  const recipeCount = new Set(toGet.flatMap((l) => l.recipes.map((r) => r.id))).size;
  const now = today();

  const save = (list: GroceryItem[]) => changeGroceries(list);
  const tick = (line: Line, checked: boolean) => save(line.parts.map((p) => ({ ...p.item, checked })));
  const pin = (line: Line, slug: string | null) =>
    save(line.parts.map(({ item }) => {
      const { store: _old, ...rest } = item;
      return slug && slug !== store?.slug ? { ...rest, store: slug } : rest;
    }));
  const remove = (line: Line) => changeGroceries([], line.parts.map((p) => p.item.id));
  const moveTo = (line: Line, aisle: Aisle) => changeSettings({ groceryAisles: { ...settings.groceryAisles, [nameKey(line.name)]: aisle } });
  const searchFor = (line: Line) => instacartSearch(line.term, line.store ?? store?.slug);

  const addTyped = () =>
    f7.dialog.prompt('Like “2 avocados” or “paper towels”.', 'Add to the list', (text: string) => {
      if (text.trim()) save([{ id: newId(), text: text.trim(), checked: false, createdAt: new Date().toISOString() }]);
    });
  const clearGot = () => changeGroceries([], got.flatMap((l) => l.parts.map((p) => p.item.id)));
  const clearAll = () =>
    f7.dialog.confirm('Everything on the grocery list comes off it. Your recipes stay as they are.', 'Clear the list?', () =>
      changeGroceries([], items.map((g) => g.id)),
    );
  const share = async () => {
    const text = listText(lines);
    try {
      if (navigator.share) await navigator.share({ title: 'Grocery list', text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Copied the list');
      }
    } catch {
      /* the share sheet was closed */
    }
  };

  /** A row: tap to tick; ↗ opens Instacart's search for it; swipe for Aisle, Store, Delete. */
  const row = (line: Line, key: string, title: ReactNode, footer: string) => (
    <ListItem
      key={key}
      swipeout
      checkbox
      checked={line.checked}
      onChange={(e: { target: { checked: boolean } }) => tick(line, e.target.checked)}
      className={line.checked ? 'ck-done' : ''}
      onSwipeoutDeleted={() => remove(line)}
    >
      <span slot="title">
        {title}
        {line.store && line.store !== store?.slug && <span className="ck-store-tag">{storeName(line.store)}</span>}
      </span>
      {footer && <span slot="footer">{footer}</span>}
      {!line.checked && (
        <Link
          slot="after"
          external
          target="_blank"
          href={searchFor(line)}
          className="ck-instacart-link"
          aria-label={`Find ${line.name} on Instacart${line.store ?? store?.slug ? ` at ${storeName(line.store ?? store?.slug)}` : ''}`}
        >
          <ArrowUpRight {...inlineIcon} />
        </Link>
      )}
      <SwipeoutActions right>
        <SwipeoutButton close className="ck-grocery-aisle" onClick={() => setMoving(line)}>
          Aisle
        </SwipeoutButton>
        {stores.length > 1 && (
          <SwipeoutButton close className="ck-grocery-store" onClick={() => setPinning(line)}>
            Store
          </SwipeoutButton>
        )}
        <SwipeoutButton delete>Delete</SwipeoutButton>
      </SwipeoutActions>
    </ListItem>
  );

  const lineTitle = (l: Line) => (
    <>
      {l.amount && <span className="ck-amount">{l.amount}</span>} {l.name}
    </>
  );
  const forRecipes = (l: Line) => (l.recipes.length ? l.recipes.map((r) => r.title).join(' · ') : 'Added by you');

  const plannedById = new Map(planned.map((p) => [p.id, p]));
  const recipeMeta = (parts: { part: { item: GroceryItem; recipe?: Recipe } }[]) => {
    const first = parts[0].part;
    const servings = first.item.servings ?? first.recipe?.servings;
    const p = parts.map((x) => x.part.item.plannedId && plannedById.get(x.part.item.plannedId)).find(Boolean);
    return [servings ? `${friendly(servings)} servings` : '', p ? [dayName(p.day, now), p.meal ? mealName(p.meal).toLowerCase() : ''].filter(Boolean).join(', ') : '']
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <Page name="groceries" className="ck-groceries" onPageAfterIn={showTabbar}>
      {/* issue #85: back to tucked-away cook mode; part of the page, so it slides with it */}
      <CookingFab slot="fixed" />
      <Navbar className="ck-navbar-root">
        <NavTitle>Groceries</NavTitle>
        <NavRight>
          <Link iconOnly onClick={() => setMoreMenu(true)} aria-label="More grocery list actions">
            <Ellipsis {...navIcon} />
          </Link>
          <Link iconOnly onClick={() => setAddMenu(true)} aria-label="Add to the grocery list" className="ck-nav-primary">
            <Plus {...navIcon} />
          </Link>
        </NavRight>
      </Navbar>

      <Block className="ck-grocery-head">
        <Segmented strong className="ck-grocery-view">
          <Button active={view === 'aisle'} onClick={() => changeSettings({ groceryView: 'aisle' })}>
            By aisle
          </Button>
          <Button active={view === 'recipe'} onClick={() => changeSettings({ groceryView: 'recipe' })}>
            By recipe
          </Button>
        </Segmented>
        <div className="ck-row ck-grocery-store-row">
          <span className="ck-note">
            {loading ? 'Loading…' : toGet.length ? `${toGet.length} to get${recipeCount ? ` · ${recipeCount} ${recipeCount === 1 ? 'recipe' : 'recipes'}` : ''}` : 'Nothing to get'}
          </span>
          <Link className="ck-scale-button" onClick={() => setStoreMenu(true)} aria-label="Which store to shop at">
            <span>{store ? `Shopping at ${store.name}` : 'Pick a store'}</span>
            <ChevronDown {...inlineIcon} />
          </Link>
        </div>
        {/* the user asked for this: the links leave the app */}
        <p className="ck-note ck-instacart-note">
          <ArrowUpRight size={14} strokeWidth={2.25} className="ck-icon" aria-hidden="true" /> opens Instacart and searches for the item
          {store ? ` at ${store.name}` : ''}. Tap a row to tick it off.
        </p>
      </Block>

      {loadError ? (
        <Block className="ck-list-state">
          <p className="ck-note">Couldn’t load the grocery list. {loadError}</p>
          <Button round className="ck-soft ck-inline-button" onClick={() => reload()}>
            Try again
          </Button>
        </Block>
      ) : loading ? (
        <div className="ck-grocery-group">
          <PlannerRowsSkeleton />
        </div>
      ) : !lines.length ? (
        <Block>
          <p className="ck-note">Nothing on the list yet. On a recipe, ⋯ → Add to Grocery List adds its ingredients; + here adds this week’s planned recipes or anything else.</p>
        </Block>
      ) : view === 'aisle' ? (
        <>
          {byAisle(toGet).map((g) => (
            <section key={g.aisle} className="ck-grocery-group">
              <div className="ck-plan-slot-label">{AISLE_NAMES[g.aisle]}</div>
              <List strongIos insetIos dividersIos className="ck-plan-list ck-grocery-list">
                {g.lines.map((l) => row(l, l.key, lineTitle(l), forRecipes(l)))}
              </List>
            </section>
          ))}
          {got.length > 0 && (
            <section className="ck-grocery-group">
              <div className="ck-plan-slot-label ck-row ck-grocery-got">
                <span>{`Got it · ${got.length}`}</span>
                <Link onClick={clearGot}>Clear</Link>
              </div>
              <List strongIos insetIos dividersIos className="ck-plan-list ck-grocery-list">
                {got.map((l) => row(l, l.key, lineTitle(l), forRecipes(l)))}
              </List>
            </section>
          )}
        </>
      ) : (
        byRecipe(lines).map((g) => {
          const photo = g.recipe && coverPhoto(g.recipe);
          return (
            <section key={g.recipe?.id ?? 'typed'} className="ck-grocery-group">
              {g.recipe ? (
                <div className="ck-grocery-recipe-head">
                  <span className={`ck-picker-thumb ck-photo${photo ? '' : ' ck-photo-empty'}`} style={photoStyle(photo)} aria-hidden="true">
                    {!photo && <ChefHat size={16} strokeWidth={1.5} />}
                  </span>
                  <div>
                    <h2>{g.recipe.title}</h2>
                    <div className="ck-note">{recipeMeta(g.parts)}</div>
                  </div>
                </div>
              ) : (
                <div className="ck-plan-slot-label">Added by you</div>
              )}
              <List strongIos insetIos dividersIos className="ck-plan-list ck-grocery-list">
                {g.parts.map(({ part, line }) => {
                  const others = line.recipes.filter((r) => r.id !== part.recipe?.id).map((r) => r.title);
                  const together = line.parts.length > 1 ? (line.amount ? `${line.amount} in all` : 'Also') + (others.length ? `${line.amount ? ', with' : ' for'} ${others.join(' and ')}` : '') : '';
                  const footer = [part.note, together].filter(Boolean).join(' · ');
                  const title = (
                    <>
                      {partAmount(part) && <span className="ck-amount">{partAmount(part)}</span>} {countName(part.name, part.unit, part.amount)}
                    </>
                  );
                  return row(line, part.item.id, title, footer);
                })}
              </List>
            </section>
          );
        })
      )}

      {/* + : this week's planned recipes, a recipe, or something typed */}
      <Actions opened={addMenu} onActionsClosed={() => setAddMenu(false)}>
        <ActionsGroup>
          <ActionsLabel>Add to the grocery list</ActionsLabel>
          <ActionsButton onClick={() => setShopWeek(true)}>Shop this week</ActionsButton>
          <ActionsButton onClick={() => setPicking(true)}>A recipe…</ActionsButton>
          <ActionsButton onClick={addTyped}>An item</ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton strong>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>

      <Actions opened={moreMenu} onActionsClosed={() => setMoreMenu(false)}>
        <ActionsGroup>
          <ActionsButton onClick={share} className={toGet.length ? '' : 'disabled'}>
            Share the list
          </ActionsButton>
          <ActionsButton onClick={clearGot} className={got.length ? '' : 'disabled'}>
            {`Clear what you got${got.length ? ` (${got.length})` : ''}`}
          </ActionsButton>
          <ActionsButton onClick={() => f7router?.navigate('/grocery-stores/')}>Your stores</ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton color="red" onClick={clearAll} className={items.length ? '' : 'disabled'}>
            Clear the list
          </ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton strong>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>

      {/* the store the list's links search */}
      <Actions opened={storeMenu} onActionsClosed={() => setStoreMenu(false)}>
        <ActionsGroup>
          <ActionsLabel>{stores.length ? 'Shop at' : 'Add the stores you shop at on Instacart'}</ActionsLabel>
          {stores.map((s) => (
            <ActionsButton key={s.slug} strong={s.slug === store?.slug} onClick={() => changeSettings({ groceryStore: s.slug })}>
              {s.name}
            </ActionsButton>
          ))}
          <ActionsButton onClick={() => f7router?.navigate('/grocery-stores/')}>{stores.length ? 'Edit stores…' : 'Add a store…'}</ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton strong>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>

      {/* swipe → Store: this one thing at another store */}
      <Actions opened={!!pinning} onActionsClosed={() => setPinning(null)}>
        <ActionsGroup>
          <ActionsLabel>{pinning ? `Which store for ${pinning.name}?` : ''}</ActionsLabel>
          {stores.map((s) => (
            <ActionsButton key={s.slug} strong={(pinning?.store ?? store?.slug) === s.slug} onClick={() => pinning && pin(pinning, s.slug)}>
              {s.slug === store?.slug ? `${s.name} (with the rest)` : s.name}
            </ActionsButton>
          ))}
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton strong>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>

      {/* swipe → Aisle: the app guessed wrong; kept for that name */}
      <Actions opened={!!moving} onActionsClosed={() => setMoving(null)}>
        <ActionsGroup>
          <ActionsLabel>{moving ? `Which aisle for ${moving.name}?` : ''}</ActionsLabel>
          {AISLES.map((a) => (
            <ActionsButton key={a} strong={moving?.aisle === a} onClick={() => moving && moveTo(moving, a)}>
              {AISLE_NAMES[a]}
            </ActionsButton>
          ))}
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton strong>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>

      <RecipePickerPopup
        mode="one"
        opened={picking}
        title="Add a recipe’s ingredients"
        recipes={[...recipes].sort(aToZ)}
        onPick={(id) => {
          setPicking(false);
          // the sheet opens once the picker has gone
          setTimeout(() => setAdding(recipes.find((r) => r.id === id) ?? null), 400);
        }}
        onClosed={() => setPicking(false)}
      />
      <AddRecipeSheet recipe={adding} onClosed={() => setAdding(null)} />
      <ShopWeekSheet opened={shopWeek} onClosed={() => setShopWeek(false)} />
    </Page>
  );
}
