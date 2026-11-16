import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, KeyboardEvent, PointerEvent, SetStateAction } from 'react';
import {
  Popup, Page, Navbar, NavLeft, NavTitle, NavRight, Link, Button, List, ListItem, Tabs, Tab,
  Actions, ActionsGroup, ActionsLabel, ActionsButton, f7,
} from 'framework7-react';
import { X, GripHorizontal, ChevronDown, ChevronRight, ChefHat, Timer as TimerIcon } from 'lucide-react';
import { coverPhoto, linkedRecipe, type Ingredient, type Recipe } from '../lib/recipe';
import { photoStyle } from './ui/photo';
import { friendly } from '../lib/ingredients';
import { amountText, footerText, type UnitPicks } from './ui/ingredientLine';
import { stepTimers, stepIngredients, clock } from '../lib/cook';
import { navIcon, inlineIcon } from './ui/icons';
import { useStore } from '../data/store';
import ScaleSheet from './ScaleSheet';
import { ConvertibleAmount, toggleTarget, withPick, type ConvertTarget } from './UnitChoices';
import UnitSheet from './UnitSheet';

type Props = {
  recipe: Recipe;
  factor: number;
  /** units picked for some ingredients (issue #6), shared with the recipe page */
  picks: UnitPicks;
  onPick: (ingredientId: string, unit: string | null) => void;
  onFactor: (f: number) => void;
  onClose: () => void;
};
type RunningTimer = { id: number; recipeId: string; label: string; step: number; endsAt: number };
type WakeLock = { release: () => Promise<void> };
/** what's ticked in one recipe */
type Ticks = { ing: Set<string>; steps: Set<string> };
/** a linked recipe's own scale and unit picks (the main recipe's live on the recipe page) */
type Amounts = { factor: number; picks: UnitPicks };

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
const noTicks = (): Ticks => ({ ing: new Set(), steps: new Set() });
const stepCount = (r: Recipe) => r.steps.filter((s) => s.kind !== 'header').length;
const names = (rs: Recipe[]) => rs.map((r) => r.title).join(rs.length > 2 ? ', ' : ' and ');

/**
 * While the recipe tabs show, Safari's status bar strip takes the tab strip's grey (it follows the page's theme
 * colour); the installed app's bar already runs under the status bar.
 */
function useStripThemeColor(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][media*="light"]');
    if (!meta) return;
    const was = meta.content;
    meta.content = getComputedStyle(document.documentElement).getPropertyValue('--ck-soft').trim() || was;
    return () => {
      meta.content = was;
    };
  }, [on]);
}

/**
 * Cook mode, laid out like Prepear's: Ingredients on top, Directions below, each half scrolling on its own,
 * with a handle between them to drag the split (the one hand-built gesture in the app, approved by the user).
 * - Tick ingredients and steps as you go; ticked rows are crossed out.
 * - Steps show the ingredients they mention (at the current scale) and timer buttons for the times they mention.
 * - Timers keep running; the soonest counts down in the top bar.
 * - The screen stays on. Closing after ticking every step offers "Mark as made".
 *
 * Issue #11, cooking several recipes at once: an ingredient made from another recipe (the sauce, the pie crust) opens
 * that recipe in a new tab: the top bar becomes a strip of recipe tabs (in place of the title), and tapping one
 * switches to it at once (Framework7 Tabs; nothing slides over anything). Every recipe stays as it was until cook
 * mode closes: what's ticked, where it's scrolled, its amounts, and the timers, which run and ring whichever recipe
 * is shown.
 */
export default function CookMode({ recipe, factor, picks, onPick, onFactor, onClose }: Props) {
  const { recipes, saveRecipe } = useStore();
  const latest = (id: string) => (id === recipe.id ? recipe : recipes.find((r) => r.id === id));

  // what's ticked, per recipe, and the linked recipes' amounts
  const [ticks, setTicks] = useState<Record<string, Ticks>>({});
  const [amounts, setAmounts] = useState<Record<string, Amounts>>({});
  const toggleTick = (recipeId: string, kind: keyof Ticks, id: string) =>
    setTicks((all) => {
      const cur = all[recipeId] ?? noTicks();
      const next = new Set(cur[kind]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...all, [recipeId]: { ...cur, [kind]: next } };
    });

  // the linked recipes opened so far (a tab each, after the main recipe's), and the recipe shown
  const [visited, setVisited] = useState<string[]>([]);
  const [shown, setShown] = useState(recipe.id);
  const show = (id: string) => {
    if (id !== recipe.id) {
      setVisited((v) => (v.includes(id) ? v : [...v, id]));
      setAmounts((a) => (a[id] ? a : { ...a, [id]: { factor: 1, picks: {} } }));
    }
    setShown(id);
  };
  const tabs = [recipe, ...visited.map(latest).filter((r): r is Recipe => !!r)];
  const tabbed = tabs.length > 1;
  useStripThemeColor(tabbed);

  // ── timers, for every recipe in cook mode ──
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [timersOpen, setTimersOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const audio = useRef<AudioContext | null>(null);
  const nextTimerId = useRef(1);
  const timerName = (t: RunningTimer) => `${t.recipeId === recipe.id ? '' : `${latest(t.recipeId)?.title ?? 'Recipe'} · `}Step ${t.step}: ${t.label}`;

  // keep the screen on while cooking (Screen Wake Lock)
  useEffect(() => {
    let lock: WakeLock | null = null;
    let done = false;
    const request = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } }).wakeLock;
        if (wl && !done) lock = await wl.request('screen');
      } catch {
        /* not supported or not allowed: the screen just follows auto-lock */
      }
    };
    request();
    const onVisible = () => document.visibilityState === 'visible' && request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  // tick once a second while a timer runs; ring and remove finished ones
  useEffect(() => {
    if (!timers.length) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      const finished = timers.filter((x) => x.endsAt <= n);
      if (finished.length) {
        setTimers((cur) => cur.filter((x) => x.endsAt > n));
        ring();
        f7.dialog.alert(finished.map((x) => `${timerName(x)} is up.`).join('\n'), 'Timer done');
      }
    }, 1000);
    return () => clearInterval(t);
  }, [timers]); // eslint-disable-line react-hooks/exhaustive-deps

  const ring = () => {
    const ctx = audio.current;
    if (!ctx) return;
    [0, 0.35, 0.7].forEach((at) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.3);
    });
  };

  const startTimer = (recipeId: string, step: number, label: string, seconds: number) => {
    // created on a tap so iPhone Safari allows the sound later
    if (!audio.current) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current = Ctx ? new Ctx() : null;
    }
    audio.current?.resume().catch(() => {});
    setNow(Date.now());
    setTimers((cur) => [...cur, { id: nextTimerId.current++, recipeId, label, step, endsAt: Date.now() + seconds * 1000 }]);
  };
  const stopTimer = (id: number) => setTimers((cur) => cur.filter((x) => x.id !== id));
  const soonest = [...timers].sort((a, b) => a.endsAt - b.endsAt)[0];

  const [split, setSplit] = useState(readSplit);

  // closing: every recipe whose steps are all ticked is offered "Mark as made" (all of them at once)
  const shut = () => f7.popup.close('.popup.ck-cook');
  const close = () => {
    const done = tabs.filter((r) => stepCount(r) > 0 && (ticks[r.id]?.steps.size ?? 0) >= stepCount(r));
    if (!done.length) return shut();
    f7.dialog
      .create({
        title: 'Done cooking?',
        text:
          done.length === 1
            ? `Mark ${done[0].title} as made? You’ve made it ${done[0].timesMade}× so far.`
            : `Mark ${names(done)} as made?`,
        // "Mark as made" doesn't fit a half-width button, so they stack (as iOS alerts do with long labels): the action on top, Not now under it
        verticalButtons: true,
        buttons: [
          {
            text: 'Mark as made',
            strong: true,
            onClick: () => {
              const at = new Date().toISOString();
              done.forEach((r) => saveRecipe({ ...r, timesMade: r.timesMade + 1, lastMadeAt: at }));
              f7.toast.show({ text: done.length === 1 ? `Marked as made · ${done[0].timesMade + 1}×` : `Marked ${done.length} recipes as made`, closeTimeout: 1800 });
              shut();
            },
          },
          { text: 'Not now', onClick: shut },
        ],
      })
      .open();
  };

  const shownRecipe = tabs.find((r) => r.id === shown) ?? recipe;

  return (
    <>
      <Popup className="ck-cook" opened onPopupClosed={onClose}>
        <Page pageContent={false}>
          <Navbar className={tabbed ? 'ck-cook-tabbed' : ''}>
            <NavLeft>
              <Link iconOnly onClick={close} aria-label="Close cook mode">
                <X {...navIcon} />
              </Link>
            </NavLeft>
            {/* issue #11: once a linked recipe is open, the bar holds a tab for each recipe in cook mode instead of the
                title (the shown tab is the title), and the shown tab runs into the page below */}
            {tabbed ? (
              <div className="ck-tabs" role="tablist" aria-label="Recipes in cook mode">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={t.id === shownRecipe.id}
                    className={`ck-tab ${t.id === shownRecipe.id ? 'ck-tab-on' : ''}`}
                    onClick={() => show(t.id)}
                  >
                    {/* a little cover photo, so a recipe is found by sight (a recipe without one shows the chef hat) */}
                    <span className={`ck-tab-thumb ck-photo ${coverPhoto(t) ? '' : 'ck-photo-empty'}`} style={photoStyle(coverPhoto(t))} aria-hidden="true">
                      {!coverPhoto(t) && <ChefHat size={14} strokeWidth={1.75} />}
                    </span>
                    <span className="ck-tab-name">{t.title}</span>
                  </button>
                ))}
              </div>
            ) : (
              <NavTitle>{recipe.title}</NavTitle>
            )}
            {/* only while a timer runs: an empty right slot still draws the bar's faint button background */}
            {soonest && (
              <NavRight>
                <Link className="ck-timer-pill" onClick={() => setTimersOpen(true)} aria-label={`Timers, next in ${clock((soonest.endsAt - now) / 1000)}`}>
                  <TimerIcon {...inlineIcon} />
                  <span>{clock((soonest.endsAt - now) / 1000)}</span>
                </Link>
              </NavRight>
            )}
          </Navbar>

          {/* one tab per recipe, all kept (ticks, scroll); only the shown one is displayed */}
          <Tabs className="ck-cook-tabs">
            {tabs.map((r, i) => {
              const own = i === 0 ? { factor, picks } : (amounts[r.id] ?? { factor: 1, picks: {} });
              const t = ticks[r.id] ?? noTicks();
              return (
                <RecipeTab
                  key={r.id}
                  recipe={r}
                  active={r.id === shownRecipe.id}
                  factor={own.factor}
                  picks={own.picks}
                  onPick={
                    i === 0
                      ? onPick
                      : (ingId, unit) => setAmounts((a) => ({ ...a, [r.id]: { factor: a[r.id]?.factor ?? 1, picks: withPick(a[r.id]?.picks ?? {}, ingId, unit) } }))
                  }
                  onFactor={i === 0 ? onFactor : (f) => setAmounts((a) => ({ ...a, [r.id]: { factor: f, picks: a[r.id]?.picks ?? {} } }))}
                  doneIng={t.ing}
                  doneSteps={t.steps}
                  onTick={(kind, id) => toggleTick(r.id, kind, id)}
                  timers={timers.filter((x) => x.recipeId === r.id)}
                  now={now}
                  onStartTimer={(step, label, seconds) => startTimer(r.id, step, label, seconds)}
                  onStopTimer={stopTimer}
                  onShow={show}
                  split={split}
                  setSplit={setSplit}
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
          {timers.map((t) => (
            <ActionsButton key={t.id}>
              {timerName(t).replace(': ', ' · ')} · {clock((t.endsAt - now) / 1000)} left
            </ActionsButton>
          ))}
        </ActionsGroup>
        {timers.length > 0 && (
          <ActionsGroup>
            <ActionsButton color="red" onClick={() => setTimers([])}>
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
};

/** One recipe in cook mode: the split screen, as a Framework7 tab. */
function RecipeTab({
  recipe, active, factor, picks, onPick, onFactor, doneIng, doneSteps, onTick,
  timers, now, onStartTimer, onStopTimer, onShow, split, setSplit,
}: TabProps) {
  const { recipes } = useStore();
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
  }, []);
  // switching away closes this recipe's unit sheet
  useEffect(() => {
    if (!active) setConverting(null);
  }, [active]);

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
        <div className="ck-pane ck-pane-ingredients" style={{ flexBasis: `${split * 100}%` }}>
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
        </div>

        {/* bottom half: directions */}
        <div className="ck-pane ck-pane-steps">
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
                      <div className="accordion-item accordion-item-opened ck-step-extra">
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
        </div>

        {/* the divider: drag to give either half more room. Last in the markup and placed on the split line, so it sits over
            both halves (their lists are positioned too) without a z-index */}
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
