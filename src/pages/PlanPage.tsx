import { useEffect, useRef, useState } from 'react';
import {
  Page, Navbar, NavTitle, NavRight, Subnavbar, Link, Block, Button, List, ListItem, SwipeoutActions, SwipeoutButton, f7,
} from 'framework7-react';
import { CalendarSearch, ChefHat, Plus } from 'lucide-react';
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
import {
  busyDays, dayName, daysBetween, mediumDate, plan, plannedOn, shortDate, today, weekDays, weekName, weekRange, weekStart,
  type Day, type Planned,
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
 * The Plan tab's Planner (issue #62): the recipes planned for real days (meal plans, #26, are templates and come later).
 * A week's calendar strip stays under the title (swipe it for other weeks) with today picked at first; below it the
 * week as an agenda, day by day, each with its recipes. Picking a day scrolls the agenda to it. + adds recipes to the
 * picked day (each day also has its own +); a row opens its recipe, and swiping it offers Move (another day, from a
 * month calendar) and Remove. The calendar button jumps to any day.
 */
export default function PlanPage() {
  const { recipes, loading: recipesLoading } = useStore();
  const { planned, loading: plannedLoading, loadError, reload, savePlanned, deletePlanned } = usePlanner();
  const now = useToday();
  const [selected, setSelected] = useState<Day>(() => plannerDay() ?? now);
  const [addingTo, setAddingTo] = useState<Day>(now);
  const [adding, setAdding] = useState(false);
  const loading = (recipesLoading || plannedLoading) && !loadError;

  const byId = new Map(recipes.map((r) => [r.id, r]));
  // a planned recipe whose recipe is gone (deleted on another device) doesn't show
  const shown = planned.filter((p) => byId.has(p.recipeId));
  const busy = busyDays(shown);
  const start = weekStart(selected);
  const label = [weekName(start, now), weekRange(start, now)].filter(Boolean).join(' · ');

  // Picking a day scrolls the agenda to it, once the page shows (the Plan tab is laid out while hidden) and the rows
  // have loaded (they move the days down).
  const agenda = useRef<HTMLDivElement>(null);
  const pending = useRef<{ day: Day; smooth: boolean } | null>({ day: selected, smooth: false });
  const scrollToPending = () => {
    const want = pending.current;
    const content = agenda.current?.closest('.page-content') as HTMLElement | null;
    const target = agenda.current?.querySelector<HTMLElement>(`[data-day="${want?.day}"]`);
    if (!want || !content || !target || !content.getClientRects().length || loading) return;
    pending.current = null;
    const top = target.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - parseFloat(getComputedStyle(content).paddingTop) - 4;
    content.scrollTo({ top: Math.max(0, top), behavior: want.smooth ? 'smooth' : 'auto' });
  };
  useEffect(scrollToPending);

  const select = (day: Day, smooth = true) => {
    pending.current = { day, smooth };
    rememberPlannerDay(day);
    setSelected(day);
  };

  // a new day (past midnight, or back after a while): if today was picked, today still is
  const shownToday = useRef(now);
  useEffect(() => {
    if (shownToday.current !== now && selected === shownToday.current) select(now, false);
    shownToday.current = now;
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  // a recipe page's Planned chip opens this page on that day
  useEffect(() => onShowInPlanner((day) => select(day, false)), []);

  const addTo = (day: Day) => {
    setAddingTo(day);
    setAdding(true);
  };
  const move = (p: Planned) =>
    pickDay({
      title: 'Move to',
      value: p.day,
      busy,
      onPick: (day) => {
        if (day === p.day) return;
        savePlanned({ ...p, day });
        toast(`Moved to ${mediumDate(day)}`);
      },
    });
  const jump = () => pickDay({ title: 'Go to a day', value: selected, busy, onPick: (day) => select(day, false) });

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
          <Link iconOnly onClick={() => addTo(selected)} aria-label={`Add recipes to ${mediumDate(selected)}`} className="ck-nav-primary">
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
            const rows = plannedOn(shown, day);
            const name = dayName(day, now);
            const near = Math.abs(daysBetween(now, day)) <= 1;
            return (
              <section key={day} data-day={day} className={`ck-plan-day${day === selected ? ' ck-plan-day-on' : ''}${day === now ? ' ck-plan-day-today' : ''}`}>
                <div className="ck-plan-day-head">
                  <h2>
                    {name} <span className="ck-plan-day-date">{near ? mediumDate(day) : shortDate(day)}</span>
                  </h2>
                  <Link iconOnly className="ck-plan-add" onClick={() => addTo(day)} aria-label={`Add recipes to ${mediumDate(day)}`}>
                    <Plus {...inlineIcon} />
                  </Link>
                </div>
                {loading ? (
                  <PlannerRowsSkeleton />
                ) : rows.length ? (
                  <List strongIos insetIos dividersIos className="ck-plan-list">
                    {rows.map((p) => {
                      const r = byId.get(p.recipeId)!;
                      const photo = coverPhoto(r);
                      return (
                        <ListItem
                          key={p.id}
                          swipeout
                          link={`/recipe/${r.id}/`}
                          title={r.title}
                          footer={r.minutes > 0 ? formatMinutes(r.minutes) : undefined}
                          onSwipeoutDeleted={() => deletePlanned(p.id)}
                        >
                          <span slot="media" className={`ck-picker-thumb ck-photo${photo ? '' : ' ck-photo-empty'}`} style={photoStyle(photo)} aria-hidden="true">
                            {!photo && <ChefHat size={16} strokeWidth={1.5} />}
                          </span>
                          <SwipeoutActions right>
                            <SwipeoutButton close className="ck-plan-move" onClick={() => move(p)}>
                              Move
                            </SwipeoutButton>
                            <SwipeoutButton delete>Remove</SwipeoutButton>
                          </SwipeoutActions>
                        </ListItem>
                      );
                    })}
                  </List>
                ) : (
                  <p className="ck-note ck-plan-empty">Nothing planned</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      <RecipePickerPopup
        mode="several"
        opened={adding}
        title={`Add to ${dayName(addingTo, now)}`}
        hint={`Tick the recipes to plan for ${mediumDate(addingTo)}.`}
        recipes={[...recipes].sort(aToZ)}
        selected={[]}
        footer={(r) => (plannedOn(shown, addingTo).some((p) => p.recipeId === r.id) ? 'Already planned that day' : undefined)}
        onDone={(ids) => {
          ids.forEach((id, i) => savePlanned(plan(id, addingTo, newId, i)));
          setAdding(false);
        }}
        onClosed={() => setAdding(false)}
      />
    </Page>
  );
}
