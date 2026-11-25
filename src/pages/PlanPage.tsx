import { useEffect, useRef, useState } from 'react';
import {
  Page, Navbar, NavTitle, NavRight, Subnavbar, Link, Block, Button, List, ListItem, SwipeoutActions, SwipeoutButton, Segmented,
} from 'framework7-react';
import { CalendarSearch, ChefHat, NotebookPen, Plus, ShoppingCart } from 'lucide-react';
import Menu from '../components/ui/Menu';
import WeekStrip from '../components/WeekStrip';
import RecipePickerPopup from '../components/RecipePickerPopup';
import { ShopWeekPopup } from '../components/AddGroceriesPopup';
import NotePopup, { openNote } from '../components/NotePopup';
import { PlannerRowsSkeleton } from '../components/ui/Skeletons';
import { formatMinutes } from '../components/ui/RecipeCard';
import { pickDay } from '../components/ui/pickDay';
import { inlineIcon, navIcon } from '../components/ui/icons';
import { photoStyle } from '../components/ui/photo';
import { showTabbar } from '../components/ui/tabbar';
import { usePlanner, useStore } from '../data/store';
import { onShowInPlanner, plannerDay, rememberPlannerDay } from '../data/plannerNav';
import { coverPhoto, newId, type Recipe } from '../lib/recipe';
import { friendly } from '../lib/ingredients';
import CookingFab from '../components/CookingFab';
import {
  busyDays, dayName, daysBetween, inMeal, mealName, mediumDate, MEALS, onDay, plan, planNote, plannedOn, reorder, shortDate, slotsOn, today,
  weekDays, weekName, weekRange, weekStart, type Day, type Meal, type Planned,
} from '../lib/planner';
import { say } from '../components/ui/toast';

const aToZ = (a: Recipe, b: Recipe) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

/** Today on this phone, kept current: the app can stay open past midnight, or come back to the front days later. */
function useToday() {
  const [now, setNow] = useState(today);
  useEffect(() => {
    const check = () => setNow(today());
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', check);
      clearInterval(timer);
    };
  }, []);
  return now;
}

/**
 * The Plan tab's Planner (issues #62, #67): what's planned for real days (meal plans, #26, are templates and come later).
 * A week's calendar strip stays under the title (swipe it for other weeks) with today picked at first; below it the
 * week as an agenda, day by day. A day's items are recipes or notes ("Eating out"), for the whole day or in a meal slot
 * (Breakfast, Lunch, Dinner). Picking a day scrolls the agenda to it, and scrolling the agenda picks the day at the top.
 * + adds recipes (in a slot, picked in the recipe picker) or a note to the picked day (each day also has its own +); a
 * recipe row opens its recipe at the servings it was planned with; a note row edits the note. Swiping a row offers Meal
 * (its slot), Move (another day, from a month calendar) and Remove. Holding a row picks it up to drag it to another
 * place in its slot (issue #164, Framework7's sortable list started by a long press, as R7 asks: no handles, no mode).
 * The calendar button jumps to any day.
 */
export default function PlanPage() {
  const { recipes, loading: recipesLoading } = useStore();
  const { planned, loading: plannedLoading, loadError, reload, savePlanned, deletePlanned } = usePlanner();
  const now = useToday();
  const [selected, setSelected] = useState<Day>(() => plannerDay() ?? now);
  const [addingTo, setAddingTo] = useState<Day>(now);
  const [addMenu, setAddMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addMeal, setAddMeal] = useState<Meal | null>(null);
  const [slotFor, setSlotFor] = useState<Planned | null>(null);
  const [shopping, setShopping] = useState(false);
  // issue #74: the note being written: a new one for `addingTo`, or one already planned
  const [noteFor, setNoteFor] = useState<{ day: Day; planned?: Planned }>({ day: now });
  const loading = (recipesLoading || plannedLoading) && !loadError;

  const byId = new Map(recipes.map((r) => [r.id, r]));
  // a planned recipe whose recipe is gone (deleted on another device) doesn't show
  const shown = planned.filter((p) => !p.recipeId || byId.has(p.recipeId));
  const busy = busyDays(shown);
  const start = weekStart(selected);
  const label = [weekName(start, now), weekRange(start, now)].filter(Boolean).join(' · ');

  // Picking a day scrolls the agenda to it, once the page shows (the Plan tab is laid out while hidden) and the rows
  // have loaded (they move the days down).
  const agenda = useRef<HTMLDivElement>(null);
  const pending = useRef<{ day: Day; smooth: boolean } | null>({ day: selected, smooth: false });
  // while the agenda scrolls to a picked day, scrolling doesn't pick the day at the top (it would pick each on the way)
  const ignoreScrollUntil = useRef(0);
  const scrollToPending = () => {
    const want = pending.current;
    const content = agenda.current?.closest('.page-content') as HTMLElement | null;
    const target = agenda.current?.querySelector<HTMLElement>(`[data-day="${want?.day}"]`);
    if (!want || !content || !target || !content.getClientRects().length || loading) return;
    pending.current = null;
    // #84: the day lands 16px under the strip, the room the first day has (.ck-agenda's top padding)
    const top = target.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - parseFloat(getComputedStyle(content).paddingTop) - 16;
    const to = Math.min(Math.max(0, top), content.scrollHeight - content.clientHeight);
    if (Math.abs(to - content.scrollTop) < 1) return;
    ignoreScrollUntil.current = Date.now() + (want.smooth ? 900 : 200);
    content.scrollTo({ top: to, behavior: want.smooth ? 'smooth' : 'auto' });
  };
  useEffect(scrollToPending);

  const select = (day: Day, smooth = true) => {
    pending.current = { day, smooth };
    rememberPlannerDay(day);
    setSelected(day);
  };

  // issue #67: the strip follows the agenda. Scrolling picks the day whose heading has passed under the strip (the last
  // day once the agenda is scrolled to its end), without scrolling again.
  const selectedNow = useRef(selected);
  selectedNow.current = selected;
  useEffect(() => {
    const content = agenda.current?.closest('.page-content') as HTMLElement | null;
    if (!content) return;
    const follow = () => {
      if (Date.now() < ignoreScrollUntil.current || !agenda.current) return;
      const days = [...agenda.current.querySelectorAll<HTMLElement>('[data-day]')];
      if (!days.length) return;
      const line = content.getBoundingClientRect().top + parseFloat(getComputedStyle(content).paddingTop) + 40;
      const atEnd = content.scrollTop + content.clientHeight >= content.scrollHeight - 2;
      let at = days[0];
      for (const d of days) if (d.getBoundingClientRect().top <= line) at = d;
      if (atEnd && content.scrollTop > 0) at = days[days.length - 1];
      const day = at.dataset.day as Day;
      if (day !== selectedNow.current) {
        rememberPlannerDay(day);
        setSelected(day);
      }
    };
    content.addEventListener('scroll', follow, { passive: true });
    return () => content.removeEventListener('scroll', follow);
  }, [loadError]);

  // a new day (past midnight, or back after a while): if today was picked, today still is
  const shownToday = useRef(now);
  useEffect(() => {
    if (shownToday.current !== now && selected === shownToday.current) select(now, false);
    shownToday.current = now;
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  // a recipe page's Planned chip opens this page on that day
  useEffect(() => onShowInPlanner((day) => select(day, false)), []);

  /** + on a day (or the title row's, for the picked day): add recipes or a note */
  const addTo = (day: Day) => {
    setAddingTo(day);
    setAddMenu(true);
  };
  const addRecipes = () => {
    setAddMeal(null);
    setAdding(true);
  };
  // issue #74: a note is written in its own screen with a big field (NotePopup), opened and focused in the tap itself so
  // the keyboard comes up
  const addNote = () => {
    setNoteFor({ day: addingTo });
    openNote();
  };
  const editNote = (p: Planned) => {
    setNoteFor({ day: p.day, planned: p });
    openNote();
  };
  // #46: what changes on the Planner says so; taking something off it can be undone (saved again, the same id)
  const saveNote = (text: string) => {
    const p = noteFor.planned;
    if (p && p.note === text) return;
    savePlanned(p ? { ...p, note: text } : planNote(text, noteFor.day, newId));
    say(p ? 'Note saved' : `Added a note to ${mediumDate(noteFor.day)}`);
  };
  const takeOff = (p: Planned) => {
    deletePlanned(p.id);
    const what = p.recipeId ? `“${byId.get(p.recipeId)?.title ?? 'the recipe'}”` : 'the note';
    say(`Removed ${what} from ${mediumDate(p.day)}`, { undo: () => savePlanned(p) });
  };
  const toMeal = (p: Planned, m: Meal | null) => {
    if ((p.meal ?? null) === m) return;
    savePlanned(inMeal(p, m));
    say(m ? `Moved to ${mealName(m)}` : 'Moved to any time');
  };
  const move = (p: Planned) =>
    pickDay({
      title: 'Move to which day?',
      value: p.day,
      busy,
      onPick: (day) => {
        if (day === p.day) return;
        savePlanned(onDay(p, day));
        say(`Moved to ${mediumDate(day)}`);
      },
    });
  // issue #164: a row dragged to another place in its slot; the slot's rows keep their new places (each one that moved
  // is saved)
  const putInOrder = (items: Planned[], from: number, to: number) => reorder(items, from, to).forEach((p) => savePlanned(p));
  const jump = () => pickDay({ title: 'Go to which day?', value: selected, busy, onPick: (day) => select(day, false) });

  const row = (p: Planned) => {
    const actions = (
      <SwipeoutActions right>
        <SwipeoutButton close className="ck-plan-meal" onClick={() => setSlotFor(p)}>
          Meal
        </SwipeoutButton>
        <SwipeoutButton close className="ck-plan-move" onClick={() => move(p)}>
          Move
        </SwipeoutButton>
        <SwipeoutButton delete>Remove</SwipeoutButton>
      </SwipeoutActions>
    );
    if (!p.recipeId) {
      return (
        <ListItem key={p.id} swipeout link="#" noChevron className="ck-plan-note" title={p.note} onClick={() => editNote(p)} onSwipeoutDeleted={() => takeOff(p)}>
          <span slot="media" className="ck-picker-thumb ck-plan-note-icon" aria-hidden="true">
            <NotebookPen size={18} strokeWidth={1.75} />
          </span>
          {actions}
        </ListItem>
      );
    }
    const r = byId.get(p.recipeId)!;
    const photo = coverPhoto(r);
    const meta = [p.servings ? `${friendly(p.servings)} servings` : '', r.minutes > 0 ? formatMinutes(r.minutes) : ''].filter(Boolean).join(' · ');
    return (
      <ListItem
        key={p.id}
        swipeout
        // issue #67: it opens at the servings it was planned with
        link={`/recipe/${r.id}/${p.servings ? `?servings=${p.servings}` : ''}`}
        title={r.title}
        footer={meta || undefined}
        onSwipeoutDeleted={() => takeOff(p)}
      >
        <span slot="media" className={`ck-picker-thumb ck-photo${photo ? '' : ' ck-photo-empty'}`} style={photoStyle(photo)} aria-hidden="true">
          {!photo && <ChefHat size={16} strokeWidth={1.5} />}
        </span>
        {actions}
      </ListItem>
    );
  };

  return (
    <Page name="plan" className="ck-planner" onPageAfterIn={() => (showTabbar(), scrollToPending())} onPageTabShow={scrollToPending}>
      {/* issue #85: back to tucked-away cook mode; part of the page, so it slides with it */}
      <CookingFab slot="fixed" />
      <Navbar className="ck-navbar-root">
        <NavTitle>Planner</NavTitle>
        <NavRight>
          {selected !== now && (
            <Link onClick={() => select(now)} className="ck-plan-today">
              Today
            </Link>
          )}
          {/* issue #64: the week's planned recipes onto the grocery list */}
          <Link iconOnly onClick={() => setShopping(true)} aria-label="Shop this week">
            <ShoppingCart {...navIcon} />
          </Link>
          <Link iconOnly onClick={jump} aria-label="Go to a day">
            <CalendarSearch {...navIcon} />
          </Link>
        </NavRight>
        <Subnavbar className="ck-docked-bar ck-week-bar">
          <div className="ck-week-label">{label}</div>
          <WeekStrip now={now} selected={selected} busy={loading ? new Set() : busy} countOf={(d) => plannedOn(shown, d).length} onSelect={(d) => select(d)} />
        </Subnavbar>
      </Navbar>

      {loadError ? (
        <Block key="error" className="ck-list-state">
          <p className="ck-note">Couldn’t load the Planner. {loadError}</p>
          <Button round className="ck-soft ck-inline-button" onClick={() => reload()}>
            Try again
          </Button>
        </Block>
      ) : (
        <div key="agenda" ref={agenda} className="ck-agenda">
          {weekDays(start).map((day) => {
            const slots = slotsOn(shown, day);
            const name = dayName(day, now);
            const near = Math.abs(daysBetween(now, day)) <= 1;
            return (
              <section key={day} data-day={day} className={`ck-plan-day${day === selected ? ' ck-plan-day-on' : ''}${day === now ? ' ck-plan-day-today' : ''}${!loading && !slots.length ? ' ck-plan-day-empty' : ''}`}>
                <div className="ck-plan-day-head">
                  <h2>
                    {name} <span className="ck-plan-day-date">{near ? mediumDate(day) : shortDate(day)}</span>
                  </h2>
                  <Link iconOnly className="ck-plan-add" onClick={() => addTo(day)} aria-label={`Add to ${mediumDate(day)}`}>
                    <Plus {...inlineIcon} />
                  </Link>
                </div>
                {loading ? (
                  <PlannerRowsSkeleton />
                ) : slots.length ? (
                  slots.map(({ meal, items }) => (
                    <div key={meal ?? 'day'} className="ck-plan-slot">
                      {meal && <div className="ck-plan-slot-label">{mealName(meal)}</div>}
                      <List
                        strongIos
                        insetIos
                        dividersIos
                        className="ck-plan-list"
                        // issue #164: hold a row to drag it (no handles: sortableEnabled stays off)
                        sortable
                        sortableTapHold
                        onSortableSort={(d: { from: number; to: number }) => putInOrder(items, d.from, d.to)}
                      >
                        {items.map(row)}
                      </List>
                    </div>
                  ))
                ) : (
                  <p className="ck-note ck-plan-empty">Nothing planned</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Menu
        opened={addMenu}
        onClosed={() => setAddMenu(false)}
        groups={[
          [
            // no header: it opens from the day's own + (#39; the bar's + went, a day has to be picked first)
            { label: 'Add recipe', icon: ChefHat, onClick: addRecipes },
            { label: 'Add note', icon: NotebookPen, onClick: addNote },
          ],
        ]}
      />

      {/* issue #67: which meal a row is for */}
      <Menu
        opened={!!slotFor}
        onClosed={() => setSlotFor(null)}
        title="Which meal?"
        groups={[
          [...MEALS, null].map((m) => ({
            label: m ? mealName(m) : 'Any time',
            checked: (slotFor?.meal ?? null) === m,
            onClick: () => slotFor && toMeal(slotFor, m),
          })),
        ]}
      />

      <ShopWeekPopup opened={shopping} day={selected} onClosed={() => setShopping(false)} />
      <NotePopup
        title={`Note for ${mediumDate(noteFor.day)}`}
        note={noteFor.planned?.note ?? ''}
        onSave={saveNote}
        onRemove={noteFor.planned ? () => takeOff(noteFor.planned!) : undefined}
      />

      <RecipePickerPopup
        mode="several"
        opened={adding}
        title={`Add to ${dayName(addingTo, now)}`}
        hint={`Tick the recipes to plan for ${mediumDate(addingTo)}.`}
        top={
          <Segmented strong className="ck-meal-choice">
            {[null, ...MEALS].map((m) => (
              <Button key={m ?? 'day'} active={addMeal === m} onClick={() => setAddMeal(m)}>
                {m ? mealName(m) : 'Any time'}
              </Button>
            ))}
          </Segmented>
        }
        recipes={[...recipes].sort(aToZ)}
        selected={[]}
        footer={(r) => (plannedOn(shown, addingTo).some((p) => p.recipeId === r.id) ? 'Already planned that day' : undefined)}
        onDone={(ids) => {
          ids.forEach((id, place) => savePlanned(plan(id, addingTo, newId, { meal: addMeal ?? undefined, place })));
          if (ids.length) {
            const what = ids.length === 1 ? `“${byId.get(ids[0])?.title ?? 'the recipe'}”` : `${ids.length} recipes`;
            say(`Added ${what} to ${[mediumDate(addingTo), addMeal && mealName(addMeal)].filter(Boolean).join(' · ')}`);
          }
          setAdding(false);
        }}
        onClosed={() => setAdding(false)}
      />
    </Page>
  );
}
