import { useEffect, useRef, useState } from 'react';
import {
  Page, Navbar, NavTitle, NavRight, Subnavbar, Link, Block, Button, List, ListItem, SwipeoutActions, SwipeoutButton, Segmented,
  Actions, ActionsGroup, ActionsLabel, ActionsButton, f7,
} from 'framework7-react';
import { CalendarSearch, ChefHat, NotebookPen, Plus } from 'lucide-react';
import WeekStrip from '../components/WeekStrip';
import RecipePickerPopup from '../components/RecipePickerPopup';
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
import {
  busyDays, dayName, daysBetween, inMeal, mealName, mediumDate, MEALS, plan, planNote, plannedOn, shortDate, slotsOn, today,
  weekDays, weekName, weekRange, weekStart, type Day, type Meal, type Planned,
} from '../lib/planner';

const aToZ = (a: Recipe, b: Recipe) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
const toast = (text: string) => f7.toast.show({ text, closeTimeout: 2000 });

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
 * (its slot), Move (another day, from a month calendar) and Remove. The calendar button jumps to any day.
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
    const top = target.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - parseFloat(getComputedStyle(content).paddingTop) - 4;
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
  const addNote = () =>
    f7.dialog.prompt(`Like “Eating out” or “Leftovers”.`, `Note for ${mediumDate(addingTo)}`, (text: string) => {
      if (text.trim()) savePlanned(planNote(text, addingTo, newId));
    });
  const editNote = (p: Planned) =>
    f7.dialog.prompt(
      'Change the note, or clear it to take it off the day.',
      `Note for ${mediumDate(p.day)}`,
      (text: string) => (text.trim() ? savePlanned({ ...p, note: text.trim() }) : deletePlanned(p.id)),
      undefined,
      p.note,
    );
  const move = (p: Planned) =>
    pickDay({
      title: 'Move to which day?',
      value: p.day,
      busy,
      onPick: (day) => {
        if (day === p.day) return;
        savePlanned({ ...p, day });
        toast(`Moved to ${mediumDate(day)}`);
      },
    });
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
        <ListItem key={p.id} swipeout link="#" noChevron className="ck-plan-note" title={p.note} onClick={() => editNote(p)} onSwipeoutDeleted={() => deletePlanned(p.id)}>
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
        onSwipeoutDeleted={() => deletePlanned(p.id)}
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
      <Navbar className="ck-navbar-root">
        <NavTitle>Planner</NavTitle>
        <NavRight>
          {selected !== now && (
            <Link onClick={() => select(now)} className="ck-plan-today">
              Today
            </Link>
          )}
          <Link iconOnly onClick={jump} aria-label="Go to a day">
            <CalendarSearch {...navIcon} />
          </Link>
          <Link iconOnly onClick={() => addTo(selected)} aria-label={`Add to ${mediumDate(selected)}`} className="ck-nav-primary">
            <Plus {...navIcon} />
          </Link>
        </NavRight>
        <Subnavbar className="ck-week-bar">
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
              <section key={day} data-day={day} className={`ck-plan-day${day === selected ? ' ck-plan-day-on' : ''}${day === now ? ' ck-plan-day-today' : ''}`}>
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
                      <List strongIos insetIos dividersIos className="ck-plan-list">
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

      <Actions opened={addMenu} onActionsClosed={() => setAddMenu(false)}>
        <ActionsGroup>
          <ActionsLabel>{`Add to ${mediumDate(addingTo)}`}</ActionsLabel>
          <ActionsButton onClick={addRecipes}>Recipes</ActionsButton>
          <ActionsButton onClick={addNote}>A note</ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton strong>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>

      {/* issue #67: which meal a row is for */}
      <Actions opened={!!slotFor} onActionsClosed={() => setSlotFor(null)}>
        <ActionsGroup>
          <ActionsLabel>Which meal?</ActionsLabel>
          {[...MEALS, null].map((m) => (
            <ActionsButton key={m ?? 'day'} strong={(slotFor?.meal ?? null) === m} onClick={() => slotFor && savePlanned(inMeal(slotFor, m))}>
              {m ? mealName(m) : 'Any time'}
            </ActionsButton>
          ))}
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton strong>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>

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
          setAdding(false);
        }}
        onClosed={() => setAdding(false)}
      />
    </Page>
  );
}
