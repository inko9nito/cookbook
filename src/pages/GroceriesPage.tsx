import { useState } from 'react';
import {
  Page, Navbar, NavTitle, NavRight, Subnavbar, Searchbar, Link, Block, Button, Segmented, List, ListItem, SwipeoutActions,
  SwipeoutButton, Actions, ActionsGroup, ActionsLabel, ActionsButton, f7,
} from 'framework7-react';
import { ArrowUpRight, ChefHat, ChevronDown, Ellipsis, Plus } from 'lucide-react';
import { showTabbar } from '../components/ui/tabbar';
import { inlineIcon, navIcon } from '../components/ui/icons';
import { useAtTop } from '../components/ui/atTop';
import { photoStyle } from '../components/ui/photo';
import { PlannerRowsSkeleton } from '../components/ui/Skeletons';
import CookingFab from '../components/CookingFab';
import RecipePickerPopup from '../components/RecipePickerPopup';
import { AddRecipeSheet, ShopWeekSheet } from '../components/AddGroceriesSheet';
import { useGroceries, usePlanner, useStore } from '../data/store';
import {
  AISLE_NAMES, AISLES, byAisle, byRecipe, instacartSearch, linesOf, listText, nameKey, partAmount, partName, type Aisle, type GroceryItem,
  type Line,
} from '../lib/groceries';
import { coverPhoto, newId, type Recipe } from '../lib/recipe';
import { dayName, mealName, today } from '../lib/planner';
import { friendly } from '../lib/ingredients';

const toast = (text: string) => f7.toast.show({ text, closeTimeout: 2200 });
const aToZ = (a: Recipe, b: Recipe) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
// the thing to buy leads the row: "White miso paste", its amount in the small print under it
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The Groceries tab (issue #64): the grocery list, by aisle or by recipe (remembered). Things from several recipes are
 * added up into one line ("3 lemons"), each saying which recipes it's for. Tapping a row ticks it; its ↗ opens
 * Instacart's search for it at the store the list is shopping at (the line at the top), or at the store it's pinned to.
 * A row ticked stays where it is, crossed out, while you're on the list (no jumping rows mid-shop); ticked lines gather
 * in Got it at the bottom once you've been elsewhere (Clear takes them off). Swiping a row: Aisle (the app guessed
 * wrong; kept for that name), Store (pin it to another store), Delete. + adds Shop this week (the Planner's recipes), a
 * recipe, or something typed. ⋯ shares what's left as text, or clears the list. The search bar finds a thing or a recipe.
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
  const [query, setQuery] = useState('');
  // ticked or unticked while on the list: where each item was then, so its row stays put (item id → ticked then)
  const [placed, setPlaced] = useState<Map<string, boolean>>(new Map());
  const { atTop, onPageInit } = useAtTop();
  const loading = (recipesLoading || listLoading) && !loadError;

  const real = new Map(items.map((g) => [g.id, g]));
  const lines = linesOf(
    items.map((g) => (placed.has(g.id) ? { ...g, checked: placed.get(g.id)! } : g)),
    recipes,
    settings.groceryAisles,
  );
  const ticked = (l: Line) => l.parts.every((p) => real.get(p.item.id)?.checked);
  const words = nameKey(query);
  const matches = (l: Line) =>
    !words || ` ${nameKey(l.name)} `.includes(` ${words}`) || l.recipes.some((r) => r.title.toLowerCase().includes(query.trim().toLowerCase()));
  const toGet = lines.filter((l) => !l.checked);
  const got = lines.filter((l) => l.checked);
  const shownToGet = toGet.filter(matches);
  const shownGot = got.filter(matches);
  const stores = settings.groceryStores;
  const store = stores.find((s) => s.slug === settings.groceryStore) ?? stores[0];
  const storeName = (slug?: string) => stores.find((s) => s.slug === slug)?.name ?? slug ?? '';
  const view = settings.groceryView;
  const now = today();

  const save = (list: GroceryItem[]) => changeGroceries(list);
  // the items as saved (a row held in place reads its items as they were)
  const saved = (line: Line) => line.parts.map((p) => real.get(p.item.id) ?? p.item);
  const tick = (line: Line, checked: boolean) => {
    setPlaced((m) => {
      const next = new Map(m);
      for (const g of saved(line)) if (!next.has(g.id)) next.set(g.id, g.checked);
      return next;
    });
    save(saved(line).map((g) => ({ ...g, checked })));
  };
  // leaving the list (another tab, the other view): ticked rows gather in Got it
  const regroup = () => setPlaced((m) => (m.size ? new Map() : m));
  const pin = (line: Line, slug: string | null) =>
    save(saved(line).map((item) => {
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
  const clearGot = () => {
    regroup();
    changeGroceries([], items.filter((g) => g.checked).map((g) => g.id));
  };
  const clearAll = () =>
    f7.dialog.confirm('Everything on the grocery list comes off it. Your recipes stay as they are.', 'Clear the list?', () =>
      changeGroceries([], items.map((g) => g.id)),
    );
  const share = async () => {
    const text = listText(linesOf(items, recipes, settings.groceryAisles));
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

  /** A row: the thing to buy, its amount and recipes under it; tap to tick; ↗ opens Instacart's search for it; swipe for Aisle, Store, Delete. */
  const row = (line: Line, key: string, title: string, footer: string) => (
    <ListItem
      key={key}
      swipeout
      checkbox
      checked={ticked(line)}
      onChange={(e: { target: { checked: boolean } }) => tick(line, e.target.checked)}
      className={ticked(line) ? 'ck-done' : ''}
      onSwipeoutDeleted={() => remove(line)}
    >
      <span slot="title">
        {cap(title)}
        {line.store && line.store !== store?.slug && <span className="ck-store-tag">{storeName(line.store)}</span>}
      </span>
      {footer && <span slot="footer">{footer}</span>}
      {!ticked(line) && (
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

  const lineFooter = (l: Line) => [l.amount, ...l.recipes.map((r) => r.title)].filter(Boolean).join(' · ');

  const plannedById = new Map(planned.map((p) => [p.id, p]));
  const recipeMeta = (parts: { part: { item: GroceryItem; recipe?: Recipe } }[]) => {
    const first = parts[0].part;
    const servings = first.item.servings ?? first.recipe?.servings;
    const p = parts.map((x) => x.part.item.plannedId && plannedById.get(x.part.item.plannedId)).find(Boolean);
    return [servings ? `${friendly(servings)} servings` : '', p ? [dayName(p.day, now), p.meal ? mealName(p.meal).toLowerCase() : ''].filter(Boolean).join(', ') : '']
      .filter(Boolean)
      .join(' · ');
  };

  const nothing = query.trim() && !shownToGet.length && !shownGot.length;
  const recipeGroups = byRecipe(lines)
    .map((g) => ({ ...g, parts: g.parts.filter(({ line }) => matches(line) || (!!g.recipe && g.recipe.title.toLowerCase().includes(query.trim().toLowerCase()))) }))
    .filter((g) => g.parts.length);

  return (
    <Page
      name="groceries"
      className={`ck-groceries${atTop ? ' ck-at-top' : ''}`}
      onPageInit={onPageInit}
      onPageAfterIn={showTabbar}
      onPageTabHide={regroup}
    >
      {/* issue #85: back to tucked-away cook mode; part of the page, so it slides with it */}
      <CookingFab slot="fixed" />
      <Navbar className="ck-navbar-root">
        <NavTitle>Groceries</NavTitle>
        {/* + first, the screen's main action, as on Recipes and Cookbooks */}
        <NavRight>
          <Link iconOnly onClick={() => setAddMenu(true)} aria-label="Add to the grocery list" className="ck-nav-primary">
            <Plus {...navIcon} />
          </Link>
          <Link iconOnly onClick={() => setMoreMenu(true)} aria-label="More grocery list actions">
            <Ellipsis {...navIcon} />
          </Link>
        </NavRight>
        {/* the search bar stays under the title while the list scrolls, as on Recipes; it finds a thing or a recipe */}
        <Subnavbar className="ck-docked-bar ck-search-bar">
          <Searchbar
            customSearch
            backdrop={false}
            disableButton={false}
            placeholder="Search the list"
            onSearchbarSearch={(_sb, q) => setQuery(String(q ?? ''))}
            onSearchbarClear={() => setQuery('')}
          />
        </Subnavbar>
      </Navbar>

      <Block className="ck-grocery-head">
        <Segmented strong className="ck-grocery-view">
          <Button active={view === 'aisle'} onClick={() => { regroup(); changeSettings({ groceryView: 'aisle' }); }}>
            By aisle
          </Button>
          <Button active={view === 'recipe'} onClick={() => { regroup(); changeSettings({ groceryView: 'recipe' }); }}>
            By recipe
          </Button>
        </Segmented>
        {/* the user asked for a note that the links leave for Instacart: it's also where the store is picked */}
        <Link className="ck-instacart-store" onClick={() => setStoreMenu(true)} aria-label={store ? `↗ opens Instacart at ${store.name}. Change the store` : 'Pick the store ↗ opens on Instacart'}>
          <ArrowUpRight size={14} strokeWidth={2.25} className="ck-icon" aria-hidden="true" />
          <span>
            {store ? (
              <>
                opens Instacart at <b>{store.name}</b>
              </>
            ) : (
              <>
                opens Instacart · <b>Pick a store</b>
              </>
            )}
          </span>
          <ChevronDown size={14} strokeWidth={2.25} className="ck-icon" aria-hidden="true" />
        </Link>
      </Block>

      {loadError ? (
        <Block className="ck-list-state">
          <p className="ck-note">Couldn’t load the grocery list. {loadError}</p>
          <Button round className="ck-soft ck-inline-button" onClick={() => reload()}>
            Try again
          </Button>
        </Block>
      ) : loading ? (
        <div className="ck-grocery-groups">
          <PlannerRowsSkeleton />
        </div>
      ) : !lines.length ? (
        <Block>
          <p className="ck-note">Nothing on the list yet. On a recipe, ⋯ → Add to Grocery List adds its ingredients; + here adds this week’s planned recipes or anything else.</p>
        </Block>
      ) : nothing ? (
        <Block>
          <p className="ck-note">{`Nothing on the list matches “${query.trim()}”.`}</p>
        </Block>
      ) : view === 'aisle' ? (
        // one column with a fixed gap between groups (the gap was lost between margins on iPhone Safari)
        <div className="ck-grocery-groups">
          {byAisle(shownToGet).map((g) => (
            <section key={g.aisle} className="ck-grocery-group">
              <div className="ck-plan-slot-label">{AISLE_NAMES[g.aisle]}</div>
              <List strongIos insetIos dividersIos className="ck-plan-list ck-grocery-list">
                {g.lines.map((l) => row(l, l.key, l.name, lineFooter(l)))}
              </List>
            </section>
          ))}
          {shownGot.length > 0 && (
            <section key="got" className="ck-grocery-group">
              <div className="ck-plan-slot-label ck-row ck-grocery-got">
                <span>{`Got it · ${got.length}`}</span>
                <Link onClick={clearGot}>Clear</Link>
              </div>
              <List strongIos insetIos dividersIos className="ck-plan-list ck-grocery-list">
                {shownGot.map((l) => row(l, l.key, l.name, lineFooter(l)))}
              </List>
            </section>
          )}
        </div>
      ) : (
        <div className="ck-grocery-groups">
          {recipeGroups.map((g) => {
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
                    const footer = [partAmount(part), part.note, together].filter(Boolean).join(' · ');
                    return row(line, part.item.id, partName(part), footer);
                  })}
                </List>
              </section>
            );
          })}
        </div>
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
