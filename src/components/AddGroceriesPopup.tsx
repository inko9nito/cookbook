import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  Popup, Page, View, Navbar, NavLeft, NavTitle, NavRight, Link, Block, BlockTitle, List, ListItem, Stepper, Actions, ActionsGroup, ActionsLabel,
  ActionsButton, f7,
} from 'framework7-react';
import { ChefHat, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { addRows, itemNames, linesOf, newItems, type AddRow } from '../lib/groceries';
import type { Names } from '../lib/grocery-names';
import { coverPhoto, newId, type Recipe } from '../lib/recipe';
import { addDays, dayName, mealName, today, weekDays, weekName, weekRange, weekStart, type Day, type Planned } from '../lib/planner';
import { friendly } from '../lib/ingredients';
import { useGroceries, useNamed, usePlanner, useStore } from '../data/store';
import { inlineIcon } from './ui/icons';
import { photoStyle } from './ui/photo';
import { AddRowsSkeleton } from './ui/Skeletons';

const toast = (text: string) => f7.toast.show({ text, closeTimeout: 2200 });
const itemsWord = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const ingredientNames = (rs: Recipe[]) => rs.flatMap((r) => r.ingredients.filter((i) => i.kind !== 'header' && i.name.trim()).map((i) => i.name));

// Issue #64: the add screens are full-screen Framework7 popups like Add Recipes (the user found the bottom sheets too
// easy to swipe away while scrolling, losing the ticks): Cancel at the top left, Next or Add at the top right, and only
// the top bar swipes it down. Shop this week's second step slides in (a Framework7 View inside the popup) with a Back.

/** Ticks on an add screen's rows: each starts as the row says (things usually on hand unticked), and a tap flips it. */
function useTicks(rows: AddRow[], round: number) {
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  useEffect(() => setFlipped(new Set()), [round]);
  const on = (r: AddRow) => r.on !== flipped.has(r.key);
  const flip = (key: string) => setFlipped((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set([...s, key])));
  return { on, flip, ticked: rows.filter(on) };
}

/**
 * The ingredients to add (the thing to buy, its amount under it), ticked unless they're usually on hand. A choice the
 * recipe offers ("soy sauce or tamari") has Pick one at its end: as picked, it adds up with the same thing on the list.
 */
function AddList({ rows, on, flip, naming, onPick }: { rows: AddRow[]; on: (r: AddRow) => boolean; flip: (key: string) => void; naming: boolean; onPick: (r: AddRow) => void }) {
  return (
    <>
        <BlockTitle className="ck-add-label">Untick what you have</BlockTitle>
        {naming ? (
          <AddRowsSkeleton />
        ) : (
          <List strongIos insetIos dividersIos className="ck-convert-list ck-add-list">
            {rows.map((r) => (
              <ListItem
                key={r.key}
                checkbox
                checked={on(r)}
                onChange={() => flip(r.key)}
                title={cap(r.name)}
                footer={[r.amount, r.note].filter(Boolean).join(' · ') || undefined}
              >
                {r.choices && (
                  <Link slot="after" className="ck-choice-link" onClick={() => onPick(r)} aria-label={`Pick which: ${r.choices.map((t) => t.item).join(' or ')}`}>
                    {r.pick ? 'Change' : 'Pick one'}
                    <ChevronDown size={14} strokeWidth={2.25} aria-hidden="true" />
                  </Link>
                )}
              </ListItem>
            ))}
          </List>
        )}
    </>
  );
}

/** Which of a recipe's choices to get (or leave it open). */
function PickChoice({ row, onPick, onClosed }: { row: AddRow | null; onPick: (key: string, item: string | null) => void; onClosed: () => void }) {
  return (
    <Actions opened={!!row} onActionsClosed={onClosed}>
      <ActionsGroup>
        <ActionsLabel>{row ? `The recipe says ${row.choices?.map((t) => t.item).join(' or ')}` : ''}</ActionsLabel>
        {row?.choices?.map((t) => (
          <ActionsButton key={t.item} strong={row.pick === t.item} onClick={() => onPick(row.key, t.item)}>
            {cap(t.item)}
          </ActionsButton>
        ))}
        {row && <ActionsButton strong={!row.pick} onClick={() => onPick(row.key, null)}>Either, decide in the store</ActionsButton>}
      </ActionsGroup>
      <ActionsGroup>
        <ActionsButton strong>Cancel</ActionsButton>
      </ActionsGroup>
    </Actions>
  );
}

/** The picks made on an add screen (row key → the thing picked). */
function usePicks(round: number) {
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [choosing, setChoosing] = useState<AddRow | null>(null);
  useEffect(() => setPicks({}), [round]);
  const pick = (key: string, item: string | null) =>
    setPicks((p) => {
      const { [key]: _was, ...rest } = p;
      return item ? { ...rest, [key]: item } : rest;
    });
  return { picks, pick, choosing, setChoosing };
}

/**
 * Issue #64: a recipe's ingredients onto the grocery list (the recipe page's ⋯ → Add to Grocery List, or the list's +
 * → A recipe): the servings (starting at the ones shown), then the ingredients at those servings, all ticked except
 * what's usually on hand; what's already on the list says so. Add (top right) adds the ticked ones. The items hold the
 * recipe's and the ingredient's ids and the servings, never the words.
 */
export function AddRecipePopup({ recipe, servings: startServings, onClosed }: { recipe: Recipe | null; servings?: number; onClosed: () => void }) {
  const { recipes, settings } = useStore();
  const { items, changeGroceries } = useGroceries();
  const popup = useRef<{ el: HTMLElement | null }>({ el: null });
  const [servings, setServings] = useState(1);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!recipe) return;
    setServings(startServings ?? recipe.servings);
    setRound((n) => n + 1);
  }, [recipe]); // eslint-disable-line react-hooks/exhaustive-deps

  const { names, naming } = useNamed(recipe ? [...ingredientNames([recipe]), ...itemNames(items, recipes)] : [], !!recipe);
  const { picks, pick, choosing, setChoosing } = usePicks(round);
  const lines = linesOf(items, recipes, settings.groceryAisles, names);
  const rows = recipe ? addRows([{ recipe, servings: servings === recipe.servings ? undefined : servings }], lines, recipes, names, picks) : [];
  const { on, flip, ticked } = useTicks(rows, round);

  const add = () => {
    if (!ticked.length || naming) return;
    changeGroceries(newItems(ticked.flatMap((r) => r.adds), newId));
    if (popup.current.el) f7.popup.close(popup.current.el);
    toast(`Added ${itemsWord(ticked.length)} to the grocery list`);
  };

  return (
    <>
      <Popup ref={popup as never} className="ck-link-popup ck-add-popup ck-add-recipe-popup" opened={!!recipe} onPopupClosed={onClosed} push swipeToClose="to-bottom" swipeHandler=".navbar">
        <Page key={round}>
          <Navbar innerClassName="navbar-inner-centered-title">
            <NavLeft>
              <Link popupClose>Cancel</Link>
            </NavLeft>
            <NavTitle>Add to List</NavTitle>
            <NavRight>
              <Link className={`ck-nav-primary${ticked.length && !naming ? '' : ' disabled'}`} onClick={add}>
                {naming ? 'Add' : `Add ${ticked.length}`}
              </Link>
            </NavRight>
          </Navbar>
          {recipe && (
            <>
              <Block className="ck-stack ck-add-head">
                <p className="ck-add-recipe-name">{recipe.title}</p>
                <div className="ck-row" style={{ justifyContent: 'space-between' }}>
                  <b>Servings</b>
                  <Stepper round className="ck-stepper" value={servings} min={1} max={99} onStepperChange={(v: number) => setServings(v)} />
                </div>
              </Block>
              <AddList rows={rows} on={on} flip={flip} naming={naming} onPick={setChoosing} />
            </>
          )}
        </Page>
      </Popup>
      {/* beside the popup, not in it: an action sheet inside the popup would sit under its own backdrop */}
      <PickChoice row={choosing} onPick={pick} onClosed={() => setChoosing(null)} />
    </>
  );
}

// ── Shop this week: two steps in a View inside the popup ──

type ShopWeek = {
  label: string;
  days: Day[];
  week: Planned[];
  byId: Map<string, Recipe>;
  onList: Set<string | undefined>;
  isOn: (p: Planned) => boolean;
  flipRecipe: (id: string) => void;
  moveWeek: (by: number) => void;
  picked: Planned[];
  now: Day;
  rows: AddRow[];
  ticks: ReturnType<typeof useTicks>;
  naming: boolean;
  names: Names;
  setChoosing: (r: AddRow) => void;
  add: () => void;
};
const ShopWeekContext = createContext<ShopWeek | null>(null);
const useShopWeek = () => useContext(ShopWeekContext)!;

/** Step one: the week's planned recipes, ticked unless gone by or already on the list; arrows for other weeks. */
function ShopRecipesStep({ f7router }: { f7router?: { navigate: (url: string) => void } }) {
  const s = useShopWeek();
  return (
    <Page name="shop-week-recipes">
      <Navbar innerClassName="navbar-inner-centered-title">
        <NavLeft>
          <Link popupClose>Cancel</Link>
        </NavLeft>
        <NavTitle>Shop this week</NavTitle>
        <NavRight>
          <Link className={`ck-nav-primary${s.picked.length ? '' : ' disabled'}`} onClick={() => s.picked.length && f7router?.navigate('/shop-week/ingredients/')}>
            Next
          </Link>
        </NavRight>
      </Navbar>
      <Block className="ck-row ck-week-nav">
        <Link iconOnly onClick={() => s.moveWeek(-1)} aria-label="The week before" className="ck-round-soft">
          <ChevronLeft {...inlineIcon} />
        </Link>
        <b>{s.label}</b>
        <Link iconOnly onClick={() => s.moveWeek(1)} aria-label="The week after" className="ck-round-soft">
          <ChevronRight {...inlineIcon} />
        </Link>
      </Block>
      {s.week.length ? (
        s.days
          .filter((d) => s.week.some((p) => p.day === d))
          .map((d) => (
            <div key={d}>
              <BlockTitle className="ck-add-label">{`${dayName(d, s.now)}${d < s.now ? ' (gone by)' : ''}`}</BlockTitle>
              <List strongIos insetIos dividersIos className="ck-convert-list ck-picker-list ck-week-list">
                {s.week
                  .filter((p) => p.day === d)
                  .map((p) => {
                    const r = s.byId.get(p.recipeId!)!;
                    const photo = coverPhoto(r);
                    const meta = [p.meal ? mealName(p.meal) : '', `${friendly(p.servings ?? r.servings)} servings`, s.onList.has(p.id) ? 'Already on your list' : ''].filter(Boolean);
                    return (
                      <ListItem key={p.id} checkbox checked={s.isOn(p)} onChange={() => s.flipRecipe(p.id)} title={r.title} footer={meta.join(' · ')}>
                        <span slot="media" className={`ck-picker-thumb ck-photo${photo ? '' : ' ck-photo-empty'}`} style={photoStyle(photo)} aria-hidden="true">
                          {!photo && <ChefHat size={16} strokeWidth={1.5} />}
                        </span>
                      </ListItem>
                    );
                  })}
              </List>
            </div>
          ))
      ) : (
        <Block>
          <p className="ck-note">Nothing planned this week. Plan recipes in the Plan tab, or look at another week.</p>
        </Block>
      )}
    </Page>
  );
}

/** Step two: their ingredients at the planned servings, added up; untick what you have, then Add. */
function ShopIngredientsStep() {
  const s = useShopWeek();
  const n = s.ticks.ticked.length;
  return (
    <Page name="shop-week-ingredients">
      <Navbar innerClassName="navbar-inner-centered-title">
        <NavLeft backLink="Recipes" />
        <NavTitle>Ingredients</NavTitle>
        <NavRight>
          <Link className={`ck-nav-primary${n && !s.naming ? '' : ' disabled'}`} onClick={s.add}>
            {s.naming ? 'Add' : `Add ${n}`}
          </Link>
        </NavRight>
      </Navbar>
      <Block className="ck-add-head">
        <p className="ck-note">{`${s.picked.length} ${s.picked.length === 1 ? 'recipe' : 'recipes'} · ${s.label}`}</p>
      </Block>
      <AddList rows={s.rows} on={s.ticks.on} flip={s.ticks.flip} naming={s.naming} onPick={s.setChoosing} />
    </Page>
  );
}

const shopRoutes = [
  { path: '/shop-week/', component: ShopRecipesStep },
  { path: '/shop-week/ingredients/', component: ShopIngredientsStep },
];

/**
 * Issue #64: Shop this week, from the grocery list's + or the Planner's cart button. Step one ticks the week's planned
 * recipes (arrows for the weeks around it); days gone by and recipes already on the list start unticked. Step two is
 * their ingredients at the planned servings, added up (two recipes' lemons are one row), untick what you have, then Add.
 */
export function ShopWeekPopup({ opened, day, onClosed }: { opened: boolean; day?: Day; onClosed: () => void }) {
  const { recipes, settings } = useStore();
  const { planned } = usePlanner();
  const { items, changeGroceries } = useGroceries();
  const popup = useRef<{ el: HTMLElement | null }>({ el: null });
  const now = today();
  const [start, setStart] = useState<Day>(weekStart(now));
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [round, setRound] = useState(0);
  // the steps' View is there only while the popup is (Framework7 moves an open popup to the app's root): closed, it
  // would put a second current page inside the Plan or Groceries page
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!opened) return;
    setLive(true);
    setStart(weekStart(day ?? now));
    setFlipped(new Set());
    setRound((n) => n + 1);
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = new Map(recipes.map((r) => [r.id, r]));
  const days = weekDays(start);
  const week = planned
    .filter((p) => p.recipeId && byId.has(p.recipeId) && days.includes(p.day))
    .sort((a, b) => a.day.localeCompare(b.day) || a.createdAt.localeCompare(b.createdAt));
  const onList = new Set(items.map((g) => g.plannedId).filter(Boolean));
  const startsOn = (p: Planned) => p.day >= now && !onList.has(p.id);
  const isOn = (p: Planned) => startsOn(p) !== flipped.has(p.id);
  const picked = week.filter(isOn);
  const flipRecipe = (id: string) => setFlipped((s) => (s.has(id) ? new Set([...s].filter((k) => k !== id)) : new Set([...s, id])));

  // the week's ingredients are named while its recipes are picked, so step two is ready when it opens
  const weekRecipes = [...new Set(week.map((p) => p.recipeId!))].map((id) => byId.get(id)!);
  const { names, naming } = useNamed([...ingredientNames(weekRecipes), ...itemNames(items, recipes)], opened);
  const { picks, pick, choosing, setChoosing } = usePicks(round);
  const lines = linesOf(items, recipes, settings.groceryAisles, names);
  const rows = addRows(picked.map((p) => ({ recipe: byId.get(p.recipeId!)!, servings: p.servings, plannedId: p.id })), lines, recipes, names, picks);
  const ticks = useTicks(rows, round);

  const moveWeek = (by: number) => {
    setStart(addDays(start, by * 7));
    setFlipped(new Set());
  };
  const add = () => {
    if (!ticks.ticked.length || naming) return;
    changeGroceries(newItems(ticks.ticked.flatMap((r) => r.adds), newId));
    if (popup.current.el) f7.popup.close(popup.current.el);
    toast(`Added ${itemsWord(ticks.ticked.length)} to the grocery list`);
  };
  const label = [weekName(start, now), weekRange(start, now)].filter(Boolean).join(' · ');

  const value: ShopWeek = { label, days, week, byId, onList, isOn, flipRecipe, moveWeek, picked, now, rows, ticks, naming, names, setChoosing, add };
  return (
    <>
      <Popup
        ref={popup as never}
        className="ck-link-popup ck-add-popup ck-shop-week-popup"
        opened={opened}
        onPopupClosed={() => {
          setLive(false);
          onClosed();
        }}
        push swipeToClose="to-bottom" swipeHandler=".navbar">
        <ShopWeekContext.Provider value={value}>
          {/* made afresh each time it opens, so it starts on step one */}
          {(live || opened) && <View key={round} url="/shop-week/" routes={shopRoutes} iosSwipeBack={false} className="ck-shop-view" />}
        </ShopWeekContext.Provider>
      </Popup>
      <PickChoice row={choosing} onPick={pick} onClosed={() => setChoosing(null)} />
    </>
  );
}
