import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, KeyboardEvent, PointerEvent, SetStateAction } from 'react';
import {
  Popup, Page, Navbar, NavTitle, NavRight, Link, Button, List, ListItem, Tabs, Tab,
  Actions, ActionsGroup, ActionsLabel, ActionsButton, f7,
} from 'framework7-react';
import { Check, ChevronDown, X, GripHorizontal, ChevronRight, Timer as TimerIcon } from 'lucide-react';
import { linkedRecipe, type Ingredient, type Recipe } from '../lib/recipe';
import CookTabs, { reducedMotion } from './CookTabs';
import { friendly } from '../lib/ingredients';
import { amountText, footerText, type UnitPicks } from './ui/ingredientLine';
import { stepTimers, stepIngredients, clock } from '../lib/cook';
import { navIcon, inlineIcon } from './ui/icons';
import { useStore } from '../data/store';
import { useCook, useNow, type RunningTimer, type Ticks } from '../data/cook';
import type { PaneScroll } from '../data/cookSession';
import ScaleSheet from './ScaleSheet';
import { ConvertibleAmount, toggleTarget, type ConvertTarget } from './UnitChoices';
import UnitSheet from './UnitSheet';

const SPLIT_KEY = 'cookbook.cookSplit';
const MIN_SPLIT = 0.18;
const MAX_SPLIT = 0.82;
const clampSplit = (n: number) => Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, n));

const readSplit = () => {
  try {
    const n = Number(localStorage.getItem(SPLIT_KEY));
    return n ? clampSplit(n) : 0.45;
  } catch {
    return 0.45;
  }
};
const saveSplit = (n: number) => {
  try {
    localStorage.setItem(SPLIT_KEY, String(n));
  } catch {
    /* private mode: the split just isn't remembered */
  }
};
const NO_TICKS: Ticks = { ing: new Set(), steps: new Set() };
const stepCount = (r: Recipe) => r.steps.filter((s) => s.kind !== 'header').length;
const ingredientCount = (r: Recipe) => r.ingredients.filter((i) => i.kind !== 'header').length;

/**
 * Cook mode, laid out like Prepear's: Ingredients on top, Directions below, each half scrolling on its own,
 * with a handle between them to drag the split (the one hand-built gesture in the app, approved by the user).
 * - Tick ingredients and steps as you go; ticked rows are crossed out.
 * - Steps show the ingredients they mention (at the current scale) and timer buttons for the times they mention.
 * - Timers keep running; the soonest counts down in the top bar.
 * - The screen stays on.
 * - A recipe with only ingredients (or only directions) shows that half alone, with no divider (issue #82).
 *
 * Issue #11, cooking several recipes at once: an ingredient made from another recipe (the sauce, the pie crust) opens
 * that recipe in a new tab. Issue #65: the tabs run along the bottom (a Framework7 tab bar, each with the recipe's photo
 * and name), so the top bar keeps the shown recipe's name; tapping one switches to it at once (Framework7 Tabs).
 * Every recipe keeps what's ticked and its amounts until cooking is done, even when its tab is closed and opened
 * again, and the timers run and ring whichever recipe is shown.
 *
 * Issue #85: it lives with the app, not the recipe page (its state is in src/data/cook.tsx). Swiping the top bar down (or
 * iOS's back gesture) tucks it away to look at other recipes (the Cooking pill at the bottom of the tabs brings it back as
 * it was). Start cooking on another recipe adds it as a tab.
 *
 * Issue #116: it's a card over the app (Framework7's push popup) with a grabber. Top right, ✓ marks the shown recipe as
 * made and closes its tab (Undo in the toast), ✕ only closes its tab; the last one ends cooking. Hold a tab to drag it to
 * another place (CookTabs).
 */
export default function CookMode() {
  const cook = useCook();
  const { recipes } = useStore();
  const s = cook.session;
  const tabs = (s?.open ?? []).map((id) => recipes.find((r) => r.id === id)).filter((r): r is Recipe => !!r);
  // nothing to show until the recipes are there (after a reload, cook mode comes back once they've loaded)
  return s && tabs.length ? <CookScreen tabs={tabs} /> : null;
}

function CookScreen({ tabs }: { tabs: Recipe[] }) {
  const cook = useCook();
  const { saveRecipe } = useStore();
  const s = cook.session!;
  const tabbed = tabs.length > 1;
  const shownRecipe = tabs.find((r) => r.id === s.shown) ?? tabs[0];

  const [timersOpen, setTimersOpen] = useState(false);
  const now = useNow(s.expanded && s.timers.length > 0);
  const soonest = [...s.timers].sort((a, b) => a.endsAt - b.endsAt)[0];
  const [split, setSplit] = useState(readSplit);

  // ── iOS's back gesture tucks cook mode away (issue #85) ──
  // Open cook mode is a step in the browser history of its own: the same state as the page under it, marked. iOS's back
  // swipe (Safari and the home-screen app both have one) goes back to the unmarked entry, which tucks cook mode away and
  // shows the page under it; Framework7's router sees the same pages and doesn't move. Without it the swipe did nothing
  // on a tab's first page, and otherwise took the page under cook mode back while cook mode stayed open. Tucked away by
  // other means (minimize, swiping the bar down, closing), the step is taken back so no empty one is left behind. Here
  // rather than in the provider: after a reload into open cook mode, this screen only comes once the recipes are there,
  // well after Framework7 has set up its views (which rewrites the history entry it starts on).
  useEffect(() => {
    if (!s.expanded) return;
    const marked = () => !!(window.history.state as { ckCook?: boolean } | null)?.ckCook;
    if (!marked()) window.history.pushState({ ...(window.history.state ?? {}), ckCook: true }, '');
    // iOS has already slid cook mode away under the finger, so it closes at once: Framework7's slide down after it
    // showed cook mode leave, come back and slide down again
    const onBack = () => {
      if (!marked()) f7.popup.close('.popup.ck-cook', false);
    };
    window.addEventListener('popstate', onBack);
    return () => {
      window.removeEventListener('popstate', onBack);
      if (marked()) window.history.back();
    };
  }, [s.expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Done cooking (or closing the last recipe): cook mode slides down first, then it's forgotten
  const ending = useRef(false);
  const endCooking = () => {
    ending.current = true;
    f7.popup.close('.popup.ck-cook');
  };
  const onClosed = () => {
    if (ending.current) cook.end();
    else cook.minimize();
  };

  // ── ✓ and ✕ (issue #116) ──
  // ✕ closes the shown recipe's tab and nothing else (what's ticked is kept, for when it's opened again): the recipe
  // drops away and its tab folds up, then the one beside it fades in. ✓ marks the recipe as made: every box ticks, its
  // tab's photo turns into a ✓, then the recipe lifts away and its tab folds up, with a toast to Undo. On the last
  // recipe, cook mode slides down instead. Web Animations, none with Reduce Motion (approved: the user asked for these
  // transitions in #116).
  const busy = useRef(false);
  const [doneId, setDoneId] = useState<string | null>(null);
  const arriving = useRef(false);
  useLayoutEffect(() => {
    if (!arriving.current) return;
    arriving.current = false;
    if (reducedMotion()) return;
    document.querySelector('.popup.ck-cook .tab-active > .ck-split-body')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  }, [s.shown]);

  const goes = async (id: string, how: 'close' | 'done') => {
    if (reducedMotion()) return;
    const body = document.querySelector<HTMLElement>('.popup.ck-cook .tab-active > .ck-split-body');
    const tab = document.querySelector<HTMLElement>(`.popup.ck-cook .ck-cook-recipe[data-id="${id}"]`);
    const away =
      how === 'close'
        ? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(48px)' }]
        : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-32px) scale(0.97)' }];
    const w = tab?.offsetWidth ?? 0;
    await Promise.all([
      body?.animate(away, { duration: 260, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).finished,
      tab?.animate(
        [
          { minWidth: `${w}px`, maxWidth: `${w}px`, opacity: 1 },
          { minWidth: '0px', maxWidth: '0px', paddingLeft: '0px', paddingRight: '0px', opacity: 0 },
        ],
        { duration: 260, easing: 'ease-in-out', fill: 'forwards' },
      ).finished,
    ]).catch(() => {});
  };

  const closeShown = async () => {
    if (busy.current) return;
    busy.current = true;
    const r = shownRecipe;
    if (tabs.length === 1) endCooking();
    else {
      await goes(r.id, 'close');
      arriving.current = true;
      cook.closeRecipe(r.id);
    }
    busy.current = false;
  };

  const doneShown = async () => {
    if (busy.current) return;
    busy.current = true;
    const r = shownRecipe;
    const at = s.open.indexOf(r.id);
    const ticks = s.ticks[r.id] ?? NO_TICKS;
    const amounts = s.amounts[r.id] ?? { factor: 1, picks: {} };
    const last = tabs.length === 1;
    const made = r.timesMade + 1;
    saveRecipe({ ...r, timesMade: made, lastMadeAt: new Date().toISOString() });
    cook.tickAll(
      r.id,
      r.ingredients.filter((i) => i.kind !== 'header').map((i) => i.id),
      r.steps.filter((x) => x.kind !== 'header').map((x) => x.id),
    );
    setDoneId(r.id);
    // the boxes fill (Framework7's own check) before the recipe goes
    await new Promise((go) => setTimeout(go, reducedMotion() ? 0 : 550));
    if (last) endCooking();
    else {
      await goes(r.id, 'done');
      arriving.current = true;
      cook.closeRecipe(r.id);
      // opened again later, it starts fresh
      cook.clearTicks(r.id);
    }
    setDoneId(null);
    busy.current = false;
    f7.toast
      .create({
        text: `Marked as made · ${made}×`,
        closeButton: true,
        closeButtonText: 'Undo',
        closeTimeout: 4000,
        on: {
          // back as it was: the count, and the recipe's tab where it was with what was ticked, cook mode open
          closeButtonClick: () => {
            saveRecipe(r);
            cook.restore(r.id, at, ticks, amounts);
          },
        },
      })
      .open();
  };

  return (
    <>
      {/* issue #116: an iOS card over the app (Framework7's push popup: rounded top corners, the app shrinking back behind
          it, as GitHub's sheets do). Swiping the top bar down tucks it away (Framework7's swipe to close, on the bar only:
          the halves scroll), and the app grows back under the finger */}
      <Popup className="ck-cook" opened={s.expanded} onPopupClosed={onClosed} push swipeToClose="to-bottom" swipeHandler=".ck-cook .navbar">
        <Page pageContent={false}>
          <Navbar>
            {/* the grabber says the card swipes down */}
            <span slot="before-inner" className="ck-grabber" aria-hidden="true" />
            <NavTitle>{shownRecipe.title}</NavTitle>
            <NavRight>
              {soonest && (
                <Link className="ck-timer-pill" onClick={() => setTimersOpen(true)} aria-label={`Timers, next in ${clock((soonest.endsAt - now) / 1000)}`}>
                  <TimerIcon {...inlineIcon} />
                  <span>{clock((soonest.endsAt - now) / 1000)}</span>
                </Link>
              )}
              {/* ✓ marks the recipe as made and closes its tab; ✕ only closes its tab */}
              <Link iconOnly className="ck-nav-primary" onClick={doneShown} aria-label={`Done: mark ${shownRecipe.title} as made`}>
                <Check {...navIcon} />
              </Link>
              <Link iconOnly onClick={closeShown} aria-label={tabbed ? `Close ${shownRecipe.title}` : 'Close cook mode'}>
                <X {...navIcon} />
              </Link>
            </NavRight>
          </Navbar>

          {/* issue #65: with more than one recipe, a tab for each along the bottom (photo and name); #116: hold one to drag it */}
          {tabbed && <CookTabs tabs={tabs} shownId={shownRecipe.id} doneId={doneId} onShow={cook.show} onMove={cook.moveRecipe} />}

          {/* one tab per recipe, all kept (ticks, scroll); only the shown one is displayed */}
          <Tabs className={`ck-cook-tabs${tabbed ? ' ck-cook-tabs-with-bar' : ''}`}>
            {tabs.map((r) => {
              const own = s.amounts[r.id] ?? { factor: 1, picks: {} };
              const t = s.ticks[r.id] ?? NO_TICKS;
              return (
                <RecipeTab
                  key={r.id}
                  recipe={r}
                  active={r.id === shownRecipe.id}
                  onScreen={s.expanded}
                  factor={own.factor}
                  picks={own.picks}
                  onPick={(ingId, unit) => cook.setPick(r.id, ingId, unit)}
                  onFactor={(f) => cook.setFactor(r.id, f)}
                  doneIng={t.ing}
                  doneSteps={t.steps}
                  onTick={(kind, id) => cook.toggleTick(r.id, kind, id)}
                  timers={s.timers.filter((x) => x.recipeId === r.id)}
                  now={now}
                  onStartTimer={(step, label, seconds) => cook.startTimer(r.id, step, label, seconds)}
                  onStopTimer={cook.stopTimer}
                  onShow={cook.show}
                  split={split}
                  setSplit={setSplit}
                  scroll={cook.restoredScroll[r.id]}
                  onScroll={(at) => {
                    cook.scroll.current = { ...cook.scroll.current, [r.id]: at };
                  }}
                />
              );
            })}
          </Tabs>
        </Page>
        {/* the Adjust amounts sheet's backdrop, inside the popup so it dims cook mode */}
        <div className="sheet-backdrop ck-cook-backdrop" />
      </Popup>

      <Actions opened={timersOpen} onActionsClosed={() => setTimersOpen(false)}>
        <ActionsGroup>
          <ActionsLabel>Timers</ActionsLabel>
          {s.timers.map((t) => (
            <ActionsButton key={t.id}>
              {cook.timerName(t).replace(': ', ' · ')} · {clock((t.endsAt - now) / 1000)} left
            </ActionsButton>
          ))}
        </ActionsGroup>
        {s.timers.length > 0 && (
          <ActionsGroup>
            <ActionsButton color="red" onClick={cook.stopAllTimers}>
              Stop all timers
            </ActionsButton>
          </ActionsGroup>
        )}
        <ActionsGroup>
          <ActionsButton strong>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>
    </>
  );
}

type TabProps = {
  recipe: Recipe;
  active: boolean;
  /** cook mode is on screen (not tucked away) */
  onScreen: boolean;
  factor: number;
  picks: UnitPicks;
  onPick: (ingredientId: string, unit: string | null) => void;
  onFactor: (f: number) => void;
  doneIng: Set<string>;
  doneSteps: Set<string>;
  onTick: (kind: keyof Ticks, id: string) => void;
  /** this recipe's running timers */
  timers: RunningTimer[];
  now: number;
  onStartTimer: (step: number, label: string, seconds: number) => void;
  onStopTimer: (id: number) => void;
  /** show a recipe (a linked ingredient opens its recipe's tab) */
  onShow: (recipeId: string) => void;
  split: number;
  setSplit: Dispatch<SetStateAction<number>>;
  /** issue #85: where the halves were scrolled to before the app was left */
  scroll?: PaneScroll;
  onScroll: (at: PaneScroll) => void;
};

/** One recipe in cook mode: the split screen, as a Framework7 tab. */
function RecipeTab({
  recipe, active, onScreen, factor, picks, onPick, onFactor, doneIng, doneSteps, onTick,
  timers, now, onStartTimer, onStopTimer, onShow, split, setSplit, scroll, onScroll,
}: TabProps) {
  const { recipes } = useStore();
  // issue #82: a recipe with only ingredients (or only directions) shows that half alone, filling the screen, with no
  // divider; an empty half under a lone heading looked broken
  const hasIngredients = ingredientCount(recipe) > 0;
  const hasSteps = stepCount(recipe) > 0;
  const halves = hasIngredients && hasSteps;
  const missing = !hasIngredients && !hasSteps ? 'No ingredients or directions yet.' : !hasSteps ? 'No directions for this recipe.' : 'No ingredients for this recipe.';
  // issue #6: the tapped amount, while its unit sheet is open
  const [converting, setConverting] = useState<ConvertTarget | null>(null);
  const [scaleOpen, setScaleOpen] = useState(false);
  const splitBox = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // while a finger is on the handle it shows bigger (like Prepear), so you can tell you've got it
  const [holding, setHolding] = useState(false);
  const handleEl = useRef<HTMLDivElement>(null);
  // a long press on the handle must not start iOS text selection (and its magnifier) in the text around it.
  // React's touch listeners are passive, so this one is added by hand to be allowed to cancel the default.
  useEffect(() => {
    const el = handleEl.current;
    if (!el) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchstart', stop, { passive: false });
    return () => el.removeEventListener('touchstart', stop);
  }, [halves]);
  // switching away closes this recipe's unit sheet
  useEffect(() => {
    if (!active) setConverting(null);
  }, [active]);

  // issue #85: back where it was scrolled to, the first time it shows (a hidden tab, or the popup before it opens, has
  // no height yet to scroll, so it waits a few frames for one)
  const ingPane = useRef<HTMLDivElement>(null);
  const stepsPane = useRef<HTMLDivElement>(null);
  const scrolledBack = useRef(!scroll);
  useEffect(() => {
    if (!active || !onScreen || scrolledBack.current || !scroll) return;
    let frame = 0;
    let tries = 0;
    const apply = () => {
      const ing = ingPane.current;
      const steps = stepsPane.current;
      const pane = steps ?? ing;
      if (!pane) return;
      if (!pane.clientHeight && tries++ < 60) {
        frame = requestAnimationFrame(apply);
        return;
      }
      if (ing) ing.scrollTop = scroll.ing;
      if (steps) steps.scrollTop = scroll.steps;
      scrolledBack.current = true;
    };
    apply();
    return () => cancelAnimationFrame(frame);
  }, [active, onScreen]); // eslint-disable-line react-hooks/exhaustive-deps
  const keepScroll = () => {
    onScroll({ ing: ingPane.current?.scrollTop ?? 0, steps: stepsPane.current?.scrollTop ?? 0 });
  };
  // steps ticked before the app was left start with their ingredients and timers folded away, as ticking left them
  const [foldedAtStart] = useState(() => new Set(doneSteps));

  const steps = useMemo(() => {
    let n = 0;
    return recipe.steps.map((s) => (s.kind === 'header' ? { ...s, n: 0 } : { ...s, n: (n += 1) }));
  }, [recipe.steps]);

  // ticking a step slides its ingredients and timers up out of the way (Framework7 accordion), unticking slides them back
  const tickStep = (id: string, input: Element) => {
    const extra = input.closest('li')?.querySelector<HTMLElement>('.ck-step-extra');
    if (extra) {
      if (doneSteps.has(id)) f7.accordion.open(extra);
      else f7.accordion.close(extra);
    }
    onTick('steps', id);
  };

  // ── the divider: drag (pointer) or arrow keys to move the split ──
  const onHandleDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    setHolding(true);
    window.getSelection()?.removeAllRanges();
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = splitBox.current;
    if (!dragging.current || !el) return;
    // the middle of the handle is the split line, so put it under the finger
    const box = el.getBoundingClientRect();
    setSplit(clampSplit((e.clientY - box.top) / box.height));
  };
  const onHandleUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setHolding(false);
    saveSplit(split);
  };
  const onHandleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const next = clampSplit(split + (e.key === 'ArrowDown' ? 0.05 : -0.05));
    setSplit(next);
    saveSplit(next);
  };

  const scaled = Math.abs(factor - 1) > 0.001;
  const servingsText = scaled ? `×${friendly(factor)} · ${friendly(recipe.servings * factor)} servings` : `${recipe.servings} servings`;

  // ingredient rows grouped under their labels
  const ingGroups: { id: string; label?: string; items: Ingredient[] }[] = [];
  for (const i of recipe.ingredients) {
    if (i.kind === 'header') ingGroups.push({ id: i.id, label: i.name, items: [] });
    else {
      if (!ingGroups.length) ingGroups.push({ id: 'ungrouped', items: [] });
      ingGroups[ingGroups.length - 1].items.push(i);
    }
  }

  return (
    <Tab className="page-content ck-split" tabActive={active}>
      <div className={`ck-split-body${holding ? ' ck-split-body-holding' : ''}`} ref={splitBox}>
        {/* top half: ingredients */}
        {(hasIngredients || !hasSteps) && (
          <div
            className={`ck-pane ck-pane-ingredients${halves ? '' : ' ck-pane-alone'}`}
            style={halves ? { flexBasis: `${split * 100}%` } : undefined}
            ref={ingPane}
            onScroll={keepScroll}
          >
            <div className="ck-pane-head">
              <h2>Ingredients</h2>
              {/* same pill as the recipe page: tap to change servings without leaving cook mode */}
              <Link className="ck-scale-button" onClick={() => setScaleOpen(true)} aria-label={`${servingsText}, adjust amounts`}>
                <span>{servingsText}</span>
                <ChevronDown {...inlineIcon} />
              </Link>
            </div>
            {ingGroups.filter((g) => g.items.length).map((g) => (
              <div key={g.id} className="ck-ing-group">
                {g.label && <div className="ck-group-label">{g.label}</div>}
                <List dividers className="ck-plain-list ck-cook-list">
                  {g.items.map((i) => (
                    <ListItem
                      key={i.id}
                      checkbox
                      checked={doneIng.has(i.id)}
                      onChange={() => onTick('ing', i.id)}
                      className={[doneIng.has(i.id) ? 'ck-done' : '', converting?.ing.id === i.id ? 'ck-ing-on' : ''].join(' ')}
                    >
                      <span slot="title">
                        {/* issue #6: tap an underlined amount to see it in other units (the rest of the row ticks it) */}
                        <ConvertibleAmount ing={i} factor={factor} picks={picks} onOpen={(t) => setConverting((cur) => toggleTarget(cur, t))} />{' '}
                        <CookName ing={i} linked={linkedRecipe(i, recipes)} onOpen={(r) => onShow(r.id)} />
                      </span>
                      {footerText(i, factor) && <span slot="footer">{footerText(i, factor)}</span>}
                    </ListItem>
                  ))}
                </List>
              </div>
            ))}
            {!halves && <p className="ck-pane-note">{missing}</p>}
          </div>
        )}

        {/* bottom half: directions */}
        {hasSteps && (
          <div className={`ck-pane ck-pane-steps${halves ? '' : ' ck-pane-alone'}`} ref={stepsPane} onScroll={keepScroll}>
            <div className="ck-pane-head">
              <h2>Directions</h2>
            </div>
            <List className="ck-plain-list ck-cook-list ck-cook-steps">
              {steps.map((s) => {
                if (s.kind === 'header') {
                  return (
                    <li key={s.id} className="ck-cook-step-group">
                      <span className="ck-group-label">{s.text}</span>
                    </li>
                  );
                }
                const done = doneSteps.has(s.id);
                const uses = stepIngredients(s.text, recipe.ingredients);
                const stepTimerList = stepTimers(s.text);
                return (
                  <ListItem key={s.id} checkbox checked={done} onChange={(e: { target: Element }) => tickStep(s.id, e.target)} className={done ? 'ck-done' : ''}>
                    <div slot="title" className="ck-cook-step">
                      <span className="ck-cook-text">
                        <b className="ck-step-no">{s.n}</b> {s.text}
                      </span>
                      {(uses.length > 0 || stepTimerList.length > 0) && (
                        // a Framework7 accordion item, so ticking the step slides this up (Framework7's own collapse) instead of
                        // it vanishing. The class string never changes, so React leaves the open/closed state to Framework7.
                        <div className={`accordion-item ck-step-extra${foldedAtStart.has(s.id) ? '' : ' accordion-item-opened'}`}>
                          <div className="accordion-item-content">
                            <div className="ck-step-extra-inner">
                              {uses.length > 0 && (
                                <span className="ck-cook-uses">{uses.map((i) => `${amountText(i, factor, picks)} ${i.name}`.trim()).join(' · ')}</span>
                              )}
                              {stepTimerList.map((t) => {
                                const running = timers.find((x) => x.step === s.n && x.label === t.label);
                                return (
                                  <Button
                                    key={t.label}
                                    className={`ck-soft ck-timer-button ${running ? 'ck-timer-running' : ''}`}
                                    onClick={(e: { preventDefault: () => void; stopPropagation: () => void }) => {
                                      // a tap on the timer must not tick the step
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (running) onStopTimer(running.id);
                                      else onStartTimer(s.n, t.label, t.seconds);
                                    }}
                                  >
                                    <TimerIcon {...inlineIcon} />
                                    {running ? `${clock((running.endsAt - now) / 1000)} left · Stop` : `${t.label} timer`}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </ListItem>
                );
              })}
            </List>
            {!halves && <p className="ck-pane-note">{missing}</p>}
          </div>
        )}

        {/* the divider: drag to give either half more room. Last in the markup and placed on the split line, so it sits over
            both halves (their lists are positioned too) without a z-index */}
        {halves && (
          <div
            ref={handleEl}
            className={`ck-split-handle${holding ? ' ck-split-holding' : ''}`}
            style={{ top: `calc(${split * 100}% - var(--ck-split-half))` }}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize ingredients and directions"
            aria-valuemin={Math.round(MIN_SPLIT * 100)}
            aria-valuemax={Math.round(MAX_SPLIT * 100)}
            aria-valuenow={Math.round(split * 100)}
            tabIndex={0}
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            onKeyDown={onHandleKey}
          >
            <span className="ck-split-grip">
              <GripHorizontal {...inlineIcon} />
            </span>
          </div>
        )}
      </div>
      {/* opened inside the cook popup (Framework7 moves it there), which would otherwise cover it */}
      <UnitSheet containerEl=".popup.ck-cook" target={converting} factor={factor} picks={picks} onPick={onPick} onClosed={() => setConverting(null)} />
      <ScaleSheet opened={scaleOpen} recipe={recipe} factor={factor} onFactor={onFactor} onClose={() => setScaleOpen(false)} backdropEl=".ck-cook-backdrop" />
    </Tab>
  );
}

/**
 * An ingredient's name in cook mode. One made from another recipe (issue #11) opens that recipe's tab; like the
 * underlined amount, tapping it doesn't tick the row.
 */
function CookName({ ing, linked, onOpen }: { ing: Ingredient; linked?: Recipe; onOpen: (r: Recipe) => void }) {
  if (!linked) return <>{ing.name}</>;
  return (
    <button
      type="button"
      className="ck-ing-linked"
      aria-label={`${ing.name}, cook the ${linked.title} recipe`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen(linked);
      }}
    >
      {ing.name}
      <ChevronRight {...inlineIcon} aria-hidden="true" />
    </button>
  );
}
