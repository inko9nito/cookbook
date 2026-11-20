import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, KeyboardEvent, PointerEvent, SetStateAction } from 'react';
import {
  IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonFooter, IonList, IonItem, IonCheckbox,
  IonAccordionGroup, IonAccordion,
} from '@ionic/react';
import { Check, ChefHat, ChevronDown, ChevronRight, GripHorizontal, Timer as TimerIcon, TimerOff, X } from 'lucide-react';
import { coverPhoto, linkedRecipe, type Ingredient, type Recipe } from '../lib/recipe';
import { friendly } from '../lib/ingredients';
import { amountText, footerText, type UnitPicks } from './ingredientLine';
import { ConvertibleAmount, toggleTarget, type ConvertTarget } from './UnitChoices';
import { clock, stepIngredients, stepTimers } from '../lib/cook';
import { useStore } from '../data/store';
import { useCook, useNow, type RunningTimer, type Ticks } from '../data/cook';
import { photoStyle } from './photo';
import { say } from './toast';
import { reducedMotion } from './photo';
import { ScaleSheet, UnitSheet } from './sheets';
import { appEl } from './modals';
import { openMenu } from './ui';
import { onCookBack } from './history';

/**
 * Cook mode on Ionic (issue #141): everything the app's cook mode does, on Ionic's components.
 * - An iOS card over the app (Ionic's card modal: the app shrinks back behind it). Swiping the top bar down tucks it away,
 *   and so does iOS's back gesture; the Cooking pill brings it back as it was.
 * - Ingredients over Directions, each half scrolling on its own, with the handle between them to drag (the app's approved
 *   hand-built gesture, the same code).
 * - Tick ingredients and steps (Ionic's checkboxes). A ticked step folds its ingredients and timers away (Ionic's accordion).
 * - Timer buttons in steps; the soonest counts down in the bar (tap it for the list); they ring anywhere in the app.
 * - Servings pill → Adjust amounts (Ionic's sheet); an underlined amount → its units (Ionic's sheet, no backdrop).
 * - A linked ingredient opens its recipe as another tab. Several recipes: tabs along the bottom; hold one to drag it.
 * - ✓ marks the recipe as made (every box ticks, its tab turns into ✓, the recipe lifts away, Undo in the toast); ✕ closes
 *   its tab (the recipe drops away). On the last recipe, the card slides down.
 */

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
    /* private mode */
  }
};
const NO_TICKS: Ticks = { ing: new Set(), steps: new Set() };
const stepCount = (r: Recipe) => r.steps.filter((s) => s.kind !== 'header').length;
const ingredientCount = (r: Recipe) => r.ingredients.filter((i) => i.kind !== 'header').length;

export default function CookMode() {
  const cook = useCook();
  const { recipes } = useStore();
  const s = cook.session;
  const tabs = (s?.open ?? []).map((id) => recipes.find((r) => r.id === id)).filter((r): r is Recipe => !!r);
  return s && tabs.length ? <CookScreen tabs={tabs} /> : null;
}

function CookScreen({ tabs }: { tabs: Recipe[] }) {
  const cook = useCook();
  const { saveRecipe } = useStore();
  const s = cook.session!;
  const tabbed = tabs.length > 1;
  const shownRecipe = tabs.find((r) => r.id === s.shown) ?? tabs[0];
  const modal = useRef<HTMLIonModalElement>(null);
  const now = useNow(s.expanded && s.timers.length > 0);
  const soonest = [...s.timers].sort((a, b) => a.endsAt - b.endsAt)[0];
  const [split, setSplit] = useState(readSplit);

  // iOS's back gesture tucks it away: open, cook mode is a history entry of its own (history.ts); Safari has already slid
  // it away under the finger, so it closes at once
  useEffect(() => {
    if (!s.expanded) return;
    return onCookBack(() => {
      if (modal.current) modal.current.animated = false;
      cook.minimize();
    });
  }, [s.expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  const ending = useRef(false);
  const endCooking = () => {
    ending.current = true;
    modal.current?.dismiss();
  };
  const onClosed = () => {
    if (modal.current) modal.current.animated = true;
    if (ending.current) {
      ending.current = false;
      cook.end();
    } else cook.minimize();
  };

  // ── ✓ and ✕ (#116): the app's own transitions (approved), on the shown recipe and its tab ──
  const busy = useRef(false);
  const [doneId, setDoneId] = useState<string | null>(null);
  const arriving = useRef(false);
  useLayoutEffect(() => {
    if (!arriving.current) return;
    arriving.current = false;
    if (reducedMotion()) return;
    document.querySelector('.ck-ion-cook .ck-split-active > .ck-split-body')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  }, [s.shown]);
  const goes = async (id: string, how: 'close' | 'done') => {
    if (reducedMotion()) return;
    const body = document.querySelector<HTMLElement>('.ck-ion-cook .ck-split-active > .ck-split-body');
    const tab = document.querySelector<HTMLElement>(`.ck-ion-cook .ck-cook-recipe[data-id="${id}"]`);
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
    await new Promise((go) => setTimeout(go, reducedMotion() ? 0 : 550));
    if (last) endCooking();
    else {
      await goes(r.id, 'done');
      arriving.current = true;
      cook.closeRecipe(r.id);
      cook.clearTicks(r.id);
    }
    setDoneId(null);
    busy.current = false;
    say(`Marked as made · ${made}×`, {
      undo: () => {
        saveRecipe(r);
        cook.restore(r.id, at, ticks, amounts);
      },
    });
  };

  const timersMenu = (el: Element) =>
    openMenu(el, [
      s.timers.map((t) => ({ label: `${cook.timerName(t).replace(': ', ' · ')} · ${clock((t.endsAt - now) / 1000)} left`, icon: TimerIcon })),
      s.timers.length ? [{ label: 'Stop all timers', icon: TimerOff, danger: true, onClick: cook.stopAllTimers }] : [],
    ]);

  return (
    <IonModal ref={modal} isOpen={s.expanded} presentingElement={appEl()} onDidDismiss={onClosed} className="ck-ion-cook">
      <IonHeader className="ck-ion-cook-header">
        <IonToolbar>
          <span className="ck-ion-grabber" aria-hidden="true" />
          <IonTitle className="ck-ion-title-small">{shownRecipe.title}</IonTitle>
          <IonButtons slot="end">
            {soonest && (
              <IonButton className="ck-ion-timer-pill" onClick={(e) => timersMenu(e.currentTarget)} aria-label={`Timers, next in ${clock((soonest.endsAt - now) / 1000)}`}>
                <TimerIcon size={16} />
                <span>{clock((soonest.endsAt - now) / 1000)}</span>
              </IonButton>
            )}
            <IonButton className="ck-ion-bar-button ck-ion-bar-primary" onClick={doneShown} aria-label={`Done: mark ${shownRecipe.title} as made`}>
              <Check size={22} strokeWidth={2.5} />
            </IonButton>
            <IonButton className="ck-ion-bar-button" onClick={closeShown} aria-label={tabbed ? `Close ${shownRecipe.title}` : 'Close cook mode'}>
              <X size={22} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent scrollY={false} className="ck-ion-cook-content">
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
      </IonContent>
      {tabbed && (
        <IonFooter className="ck-ion-cook-footer">
          <CookTabs tabs={tabs} shownId={shownRecipe.id} doneId={doneId} onShow={cook.show} onMove={cook.moveRecipe} />
        </IonFooter>
      )}
    </IonModal>
  );
}

type TabProps = {
  recipe: Recipe;
  active: boolean;
  onScreen: boolean;
  factor: number;
  picks: UnitPicks;
  onPick: (ingredientId: string, unit: string | null) => void;
  onFactor: (f: number) => void;
  doneIng: Set<string>;
  doneSteps: Set<string>;
  onTick: (kind: keyof Ticks, id: string) => void;
  timers: RunningTimer[];
  now: number;
  onStartTimer: (step: number, label: string, seconds: number) => void;
  onStopTimer: (id: number) => void;
  onShow: (recipeId: string) => void;
  split: number;
  setSplit: Dispatch<SetStateAction<number>>;
  scroll?: { ing: number; steps: number };
  onScroll: (at: { ing: number; steps: number }) => void;
};

function RecipeTab({
  recipe, active, onScreen, factor, picks, onPick, onFactor, doneIng, doneSteps, onTick,
  timers, now, onStartTimer, onStopTimer, onShow, split, setSplit, scroll, onScroll,
}: TabProps) {
  const { recipes } = useStore();
  const hasIngredients = ingredientCount(recipe) > 0;
  const hasSteps = stepCount(recipe) > 0;
  const halves = hasIngredients && hasSteps;
  const missing = !hasIngredients && !hasSteps ? 'No ingredients or directions yet.' : !hasSteps ? 'No directions for this recipe.' : 'No ingredients for this recipe.';
  const [converting, setConverting] = useState<ConvertTarget | null>(null);
  const [scaleOpen, setScaleOpen] = useState(false);
  const splitBox = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [holding, setHolding] = useState(false);
  const handleEl = useRef<HTMLDivElement>(null);

  // the card swipes down from its top bar only: a finger in the halves scrolls them, and on the handle drags the split
  useEffect(() => {
    const box = splitBox.current;
    const handle = handleEl.current;
    const stop = (e: Event) => e.stopPropagation();
    const noSelect = (e: TouchEvent) => {
      e.stopPropagation();
      e.preventDefault();
    };
    box?.addEventListener('touchstart', stop, { passive: true });
    handle?.addEventListener('touchstart', noSelect, { passive: false });
    return () => {
      box?.removeEventListener('touchstart', stop);
      handle?.removeEventListener('touchstart', noSelect);
    };
  }, [halves]);
  useEffect(() => {
    if (!active) setConverting(null);
  }, [active]);

  const ingPane = useRef<HTMLDivElement>(null);
  const stepsPane = useRef<HTMLDivElement>(null);
  const scrolledBack = useRef(!scroll);
  useEffect(() => {
    if (!active || !onScreen || scrolledBack.current || !scroll) return;
    let frame = 0;
    let tries = 0;
    const apply = () => {
      const pane = stepsPane.current ?? ingPane.current;
      if (!pane) return;
      if (!pane.clientHeight && tries++ < 60) {
        frame = requestAnimationFrame(apply);
        return;
      }
      if (ingPane.current) ingPane.current.scrollTop = scroll.ing;
      if (stepsPane.current) stepsPane.current.scrollTop = scroll.steps;
      scrolledBack.current = true;
    };
    apply();
    return () => cancelAnimationFrame(frame);
  }, [active, onScreen]); // eslint-disable-line react-hooks/exhaustive-deps
  const keepScroll = () => onScroll({ ing: ingPane.current?.scrollTop ?? 0, steps: stepsPane.current?.scrollTop ?? 0 });

  const steps = useMemo(() => {
    let n = 0;
    return recipe.steps.map((st) => (st.kind === 'header' ? { ...st, n: 0 } : { ...st, n: (n += 1) }));
  }, [recipe.steps]);
  // the steps whose extras are showing: every step not ticked (Ionic's accordion folds a ticked step's extras away)
  const openExtras = steps.filter((st) => st.kind !== 'header' && !doneSteps.has(st.id)).map((st) => st.id);

  const onHandleDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    setHolding(true);
    window.getSelection()?.removeAllRanges();
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = splitBox.current;
    if (!dragging.current || !el) return;
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
  const ingGroups: { id: string; label?: string; items: Ingredient[] }[] = [];
  for (const i of recipe.ingredients) {
    if (i.kind === 'header') ingGroups.push({ id: i.id, label: i.name, items: [] });
    else {
      if (!ingGroups.length) ingGroups.push({ id: 'ungrouped', items: [] });
      ingGroups[ingGroups.length - 1].items.push(i);
    }
  }

  return (
    <div className={`ck-ion-split${active ? ' ck-split-active' : ''}`}>
      <div className={`ck-split-body${holding ? ' ck-split-body-holding' : ''}`} ref={splitBox}>
        {(hasIngredients || !hasSteps) && (
          <div
            className={`ck-pane ck-pane-ingredients${halves ? '' : ' ck-pane-alone'}`}
            style={halves ? { flexBasis: `${split * 100}%` } : undefined}
            ref={ingPane}
            onScroll={keepScroll}
          >
            <div className="ck-pane-head">
              <h2>Ingredients</h2>
              <button type="button" className="ck-scale-button ck-ion-pill-button" onClick={() => setScaleOpen(true)} aria-label={`${servingsText}, adjust amounts`}>
                <span>{servingsText}</span>
                <ChevronDown size={16} />
              </button>
            </div>
            {ingGroups.filter((g) => g.items.length).map((g) => (
              <div key={g.id} className="ck-ing-group">
                {g.label && <div className="ck-group-label">{g.label}</div>}
                <IonList lines="full" className="ck-ion-cook-list">
                  {g.items.map((i) => (
                    <IonItem key={i.id} className={[doneIng.has(i.id) ? 'ck-done' : '', converting?.ing.id === i.id ? 'ck-ing-on' : ''].join(' ')}>
                      {/* the box on its own (Ionic's checkbox keeps taps on its label from buttons inside it); the text
                          beside it ticks the row too, and its amount and linked recipe stay buttons of their own */}
                      <IonCheckbox slot="start" className="ck-ion-tick" aria-label={`${i.name}, got it`} checked={doneIng.has(i.id)} onIonChange={() => onTick('ing', i.id)} />
                      <div className="ck-ion-cook-line" onClick={() => onTick('ing', i.id)}>
                        <ConvertibleAmount ing={i} factor={factor} picks={picks} onOpen={(t) => setConverting((cur) => toggleTarget(cur, t))} />{' '}
                        <CookName ing={i} linked={linkedRecipe(i, recipes)} onOpen={(r) => onShow(r.id)} />
                        {footerText(i, factor) && <span className="ck-ion-row-note">{footerText(i, factor)}</span>}
                      </div>
                    </IonItem>
                  ))}
                </IonList>
              </div>
            ))}
            {!halves && <p className="ck-pane-note">{missing}</p>}
          </div>
        )}

        {hasSteps && (
          <div className={`ck-pane ck-pane-steps${halves ? '' : ' ck-pane-alone'}`} ref={stepsPane} onScroll={keepScroll}>
            <div className="ck-pane-head">
              <h2>Directions</h2>
            </div>
            <IonAccordionGroup multiple value={openExtras} className="ck-ion-step-folds">
              <IonList lines="full" className="ck-ion-cook-list ck-ion-cook-steps">
                {steps.map((st) => {
                  if (st.kind === 'header') {
                    return (
                      <div key={st.id} className="ck-cook-step-group">
                        <span className="ck-group-label">{st.text}</span>
                      </div>
                    );
                  }
                  const done = doneSteps.has(st.id);
                  const uses = stepIngredients(st.text, recipe.ingredients);
                  const stepTimerList = stepTimers(st.text);
                  return (
                    <IonItem key={st.id} className={done ? 'ck-done' : ''}>
                      <IonCheckbox slot="start" className="ck-ion-tick" aria-label={`Step ${st.n}, done`} checked={done} onIonChange={() => onTick('steps', st.id)} />
                      <div className="ck-cook-step" onClick={() => onTick('steps', st.id)}>
                          <span className="ck-cook-text">
                            <b className="ck-step-no">{st.n}</b> {st.text}
                          </span>
                          {(uses.length > 0 || stepTimerList.length > 0) && (
                            <IonAccordion value={st.id} toggleIcon="" className="ck-ion-step-extra">
                              <span slot="header" className="ck-ion-fold-header" />
                              <span slot="content" className="ck-step-extra-inner">
                                {uses.length > 0 && <span className="ck-cook-uses">{uses.map((i) => `${amountText(i, factor, picks)} ${i.name}`.trim()).join(' · ')}</span>}
                                {stepTimerList.map((t) => {
                                  const running = timers.find((x) => x.step === st.n && x.label === t.label);
                                  return (
                                    <button
                                      key={t.label}
                                      type="button"
                                      className={`ck-ion-timer-button${running ? ' ck-timer-running' : ''}`}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (running) onStopTimer(running.id);
                                        else onStartTimer(st.n, t.label, t.seconds);
                                      }}
                                    >
                                      <TimerIcon size={16} />
                                      {running ? `${clock((running.endsAt - now) / 1000)} left · Stop` : `${t.label} timer`}
                                    </button>
                                  );
                                })}
                              </span>
                            </IonAccordion>
                          )}
                      </div>
                    </IonItem>
                  );
                })}
              </IonList>
            </IonAccordionGroup>
            {!halves && <p className="ck-pane-note">{missing}</p>}
          </div>
        )}

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
              <GripHorizontal size={16} />
            </span>
          </div>
        )}
      </div>
      {active && (
        <>
          <UnitSheet target={converting} factor={factor} picks={picks} onPick={onPick} onClosed={() => setConverting(null)} />
          <ScaleSheet open={scaleOpen} recipe={recipe} factor={factor} onFactor={onFactor} onClose={() => setScaleOpen(false)} />
        </>
      )}
    </div>
  );
}

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
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}

// ── the recipe tabs along the bottom (#65), hold one to drag it (#116): the app's approved gesture, the same code ──

const HOLD_MS = 350;
const SLOP = 8;
const EDGE = 36;
type Drag = { id: string; el: HTMLElement; startX: number; startY: number; x: number; grab: number; lifted: boolean; hold: number };

function CookTabs({ tabs, shownId, doneId, onShow, onMove }: { tabs: Recipe[]; shownId: string; doneId: string | null; onShow: (id: string) => void; onMove: (id: string, to: number) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const before = useRef<Map<string, number> | null>(null);
  const dropped = useRef(false);
  const tabEls = () => [...(strip.current?.querySelectorAll<HTMLElement>('.ck-cook-recipe') ?? [])];
  const toContent = (clientX: number) => {
    const box = strip.current;
    return box ? clientX - box.getBoundingClientRect().left + box.scrollLeft : clientX;
  };
  const follow = () => {
    const d = drag.current;
    if (!d?.lifted) return;
    d.el.style.transform = `translateX(${d.x - d.grab - d.el.offsetLeft}px) scale(1.05)`;
  };
  useEffect(() => {
    const box = strip.current;
    const tab = box?.querySelector<HTMLElement>('.ck-cook-recipe-on');
    if (!box || !tab || drag.current) return;
    const left = tab.offsetLeft;
    const target = left < box.scrollLeft ? left - 14 : left + tab.offsetWidth > box.scrollLeft + box.clientWidth ? left + tab.offsetWidth - box.clientWidth + 14 : null;
    if (target !== null) box.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [shownId, tabs.length]);
  const order = tabs.map((t) => t.id).join(' ');
  useLayoutEffect(() => {
    const was = before.current;
    before.current = null;
    if (!was) return;
    follow();
    if (reducedMotion()) return;
    for (const el of tabEls()) {
      const id = el.dataset.id!;
      const dx = (was.get(id) ?? el.offsetLeft) - el.offsetLeft;
      if (id === drag.current?.id || !dx) continue;
      el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 180, easing: 'ease-out' });
    }
  }, [order]); // eslint-disable-line react-hooks/exhaustive-deps
  const lift = () => {
    const d = drag.current;
    if (!d) return;
    d.lifted = true;
    d.grab = d.x - d.el.offsetLeft;
    setLiftedId(d.id);
    window.getSelection()?.removeAllRanges();
    follow();
  };
  const start = (id: string, el: HTMLElement, clientX: number, clientY: number, mouse: boolean) => {
    if (drag.current) return;
    const d: Drag = { id, el, startX: clientX, startY: clientY, x: toContent(clientX), grab: 0, lifted: false, hold: 0 };
    drag.current = d;
    if (!mouse) d.hold = window.setTimeout(lift, HOLD_MS);
  };
  const cancel = () => {
    const d = drag.current;
    if (d) clearTimeout(d.hold);
    drag.current = null;
  };
  const move = (clientX: number, clientY: number, mouse: boolean) => {
    const d = drag.current;
    if (!d) return;
    if (!d.lifted) {
      const far = Math.hypot(clientX - d.startX, clientY - d.startY) > (mouse ? 4 : SLOP);
      if (!far) return;
      if (!mouse) return cancel();
      d.x = toContent(d.startX);
      lift();
    }
    const box = strip.current;
    if (box) {
      const r = box.getBoundingClientRect();
      if (clientX < r.left + EDGE) box.scrollLeft -= 8;
      else if (clientX > r.right - EDGE) box.scrollLeft += 8;
    }
    d.x = toContent(clientX);
    follow();
    const els = tabEls();
    const at = els.indexOf(d.el);
    const middle = d.x - d.grab + d.el.offsetWidth / 2;
    let to = at;
    while (to < els.length - 1 && middle > els[to + 1].offsetLeft + els[to + 1].offsetWidth / 2) to++;
    while (to > 0 && middle < els[to - 1].offsetLeft + els[to - 1].offsetWidth / 2) to--;
    if (to !== at) {
      before.current = new Map(els.map((el) => [el.dataset.id!, el.offsetLeft]));
      onMove(d.id, to);
    }
  };
  const end = () => {
    const d = drag.current;
    if (!d) return;
    clearTimeout(d.hold);
    drag.current = null;
    if (!d.lifted) return;
    dropped.current = true;
    setTimeout(() => (dropped.current = false), 400);
    const from = d.el.style.transform;
    d.el.style.transform = '';
    setLiftedId(null);
    if (from && !reducedMotion()) d.el.animate([{ transform: from }, { transform: 'none' }], { duration: 160, easing: 'ease-out' });
  };
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || !drag.current) return;
      if (drag.current.lifted && e.cancelable) e.preventDefault();
      move(t.clientX, t.clientY, false);
    };
    const onEnd = () => end();
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  });
  return (
    <div ref={strip} className={`ck-ion-cook-tabs${liftedId ? ' ck-cook-recipes-dragging' : ''}`}>
      {tabs.map((t) => {
        const photo = coverPhoto(t);
        return (
          <button
            key={t.id}
            type="button"
            data-id={t.id}
            className={['ck-cook-recipe', t.id === shownId ? 'ck-cook-recipe-on' : '', t.id === liftedId ? 'ck-cook-recipe-lifted' : ''].join(' ')}
            onClick={() => !dropped.current && onShow(t.id)}
            onTouchStart={(e) => start(t.id, e.currentTarget, e.touches[0].clientX, e.touches[0].clientY, false)}
            onMouseDown={(e) => e.button === 0 && start(t.id, e.currentTarget, e.clientX, e.clientY, true)}
            onMouseMove={(e) => drag.current && move(e.clientX, e.clientY, true)}
            onMouseUp={end}
            onMouseLeave={() => drag.current?.lifted || cancel()}
            onContextMenu={(e) => e.preventDefault()}
            aria-pressed={t.id === shownId}
          >
            {t.id === doneId ? (
              <span className="ck-tab-thumb ck-tab-done" aria-hidden="true">
                <Check size={16} strokeWidth={3} />
              </span>
            ) : (
              <span className={`ck-tab-thumb ck-photo ${photo ? '' : 'ck-photo-empty'}`} style={photoStyle(photo)} aria-hidden="true">
                {!photo && <ChefHat size={14} strokeWidth={1.75} />}
              </span>
            )}
            <span className="ck-tab-name">{t.title}</span>
          </button>
        );
      })}
    </div>
  );
}
