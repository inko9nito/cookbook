import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import {
  Popup, Page, Navbar, NavLeft, NavTitle, NavRight, Link, Button, List, ListItem,
  Actions, ActionsGroup, ActionsLabel, ActionsButton, f7,
} from 'framework7-react';
import { X, GripHorizontal, ChevronDown, Timer as TimerIcon } from 'lucide-react';
import type { Ingredient, Recipe } from '../lib/recipe';
import { friendly } from '../lib/ingredients';
import { amountText, footerText, type UnitPicks } from './ui/ingredientLine';
import { stepTimers, stepIngredients, clock } from '../lib/cook';
import { navIcon, inlineIcon } from './ui/icons';
import { useStore } from '../data/store';
import ScaleSheet from './ScaleSheet';
import UnitPopover, { ConvertibleAmount, type ConvertTarget } from './UnitPopover';

type Props = {
  recipe: Recipe;
  factor: number;
  /** units picked for some ingredients (issue #6), shared with the recipe page */
  picks: UnitPicks;
  onPick: (ingredientId: string, unit: string | null) => void;
  onFactor: (f: number) => void;
  onClose: () => void;
};
type RunningTimer = { id: number; label: string; step: number; endsAt: number };
type WakeLock = { release: () => Promise<void> };

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

/**
 * Cook mode, laid out like Prepear's: Ingredients on top, Directions below, each half scrolling on its own,
 * with a handle between them to drag the split (the one hand-built gesture in the app, approved by the user).
 * - Tick ingredients and steps as you go; ticked rows are crossed out.
 * - Steps show the ingredients they mention (at the current scale) and timer buttons for the times they mention.
 * - Timers keep running; the soonest counts down in the top bar.
 * - The screen stays on. Closing after ticking every step offers "Mark as made".
 */
export default function CookMode({ recipe, factor, picks, onPick, onFactor, onClose }: Props) {
  // issue #6: the tapped amount, while its unit popover is open
  const [converting, setConverting] = useState<ConvertTarget | null>(null);
  const { saveRecipe } = useStore();
  const [split, setSplit] = useState(readSplit);
  const [doneIng, setDoneIng] = useState<Set<string>>(new Set());
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [timersOpen, setTimersOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
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
  const [scaleOpen, setScaleOpen] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const nextTimerId = useRef(1);

  const steps = useMemo(() => {
    let n = 0;
    return recipe.steps.map((s) => (s.kind === 'header' ? { ...s, n: 0 } : { ...s, n: (n += 1) }));
  }, [recipe.steps]);
  const stepCount = steps.filter((s) => s.kind !== 'header').length;

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
        f7.dialog.alert(finished.map((x) => `Step ${x.step}: ${x.label} is up.`).join('\n'), 'Timer done');
      }
    }, 1000);
    return () => clearInterval(t);
  }, [timers]);

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

  const startTimer = (step: number, label: string, seconds: number) => {
    // created on a tap so iPhone Safari allows the sound later
    if (!audio.current) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current = Ctx ? new Ctx() : null;
    }
    audio.current?.resume().catch(() => {});
    setNow(Date.now());
    setTimers((cur) => [...cur, { id: nextTimerId.current++, label, step, endsAt: Date.now() + seconds * 1000 }]);
  };

  const toggle = (set: typeof setDoneIng, id: string) =>
    set((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ticking a step slides its ingredients and timers up out of the way (Framework7 accordion), unticking slides them back
  const tickStep = (id: string, input: Element) => {
    const extra = input.closest('li')?.querySelector<HTMLElement>('.ck-step-extra');
    if (extra) {
      if (doneSteps.has(id)) f7.accordion.open(extra);
      else f7.accordion.close(extra);
    }
    toggle(setDoneSteps, id);
  };

  // ── the divider: drag (pointer) or arrow keys to move the split ──
  const saveSplit = (n: number) => {
    try {
      localStorage.setItem(SPLIT_KEY, String(n));
    } catch {
      /* private mode: the split just isn't remembered */
    }
  };
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

  const close = () => {
    if (stepCount > 0 && doneSteps.size >= stepCount) {
      f7.dialog
        .create({
          title: 'Done cooking?',
          text: `Mark ${recipe.title} as made? You’ve made it ${recipe.timesMade}× so far.`,
          // "Mark as made" doesn't fit a half-width button, so they stack (as iOS alerts do with long labels): the action on top, Not now under it
          verticalButtons: true,
          buttons: [
            {
              text: 'Mark as made',
              strong: true,
              onClick: () => {
                saveRecipe({ ...recipe, timesMade: recipe.timesMade + 1, lastMadeAt: new Date().toISOString() });
                f7.toast.show({ text: `Marked as made · ${recipe.timesMade + 1}×`, closeTimeout: 1800 });
                f7.popup.close('.ck-cook');
              },
            },
            { text: 'Not now', onClick: () => f7.popup.close('.ck-cook') },
          ],
        })
        .open();
    } else {
      f7.popup.close('.ck-cook');
    }
  };

  const soonest = [...timers].sort((a, b) => a.endsAt - b.endsAt)[0];
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
    <>
      <Popup className="ck-cook" opened onPopupClosed={onClose}>
        <Page pageContent={false}>
          <Navbar>
            <NavLeft>
              <Link iconOnly onClick={close} aria-label="Close cook mode">
                <X {...navIcon} />
              </Link>
            </NavLeft>
            <NavTitle>{recipe.title}</NavTitle>
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

          <div className="page-content ck-split">
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
                        onChange={() => toggle(setDoneIng, i.id)}
                        className={[doneIng.has(i.id) ? 'ck-done' : '', converting?.ing.id === i.id ? 'ck-ing-on' : ''].join(' ')}
                      >
                        <span slot="title">
                          {/* issue #6: tap an underlined amount to see it in other units (the rest of the row ticks it) */}
                          <ConvertibleAmount ing={i} factor={factor} picks={picks} onOpen={setConverting} /> {i.name}
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
                                        if (running) setTimers((cur) => cur.filter((x) => x.id !== running.id));
                                        else startTimer(s.n, t.label, t.seconds);
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
          </div>
          <UnitPopover slot="fixed" containerEl=".popup.ck-cook" target={converting} factor={factor} picks={picks} onPick={onPick} onClosed={() => setConverting(null)} />
        </Page>
        {/* the Adjust amounts sheet's backdrop, inside the popup so it dims cook mode */}
        <div className="sheet-backdrop ck-cook-backdrop" />
      </Popup>
      <ScaleSheet opened={scaleOpen} recipe={recipe} factor={factor} onFactor={onFactor} onClose={() => setScaleOpen(false)} backdropEl=".ck-cook-backdrop" />

      <Actions opened={timersOpen} onActionsClosed={() => setTimersOpen(false)}>
        <ActionsGroup>
          <ActionsLabel>Timers</ActionsLabel>
          {timers.map((t) => (
            <ActionsButton key={t.id}>
              Step {t.step} · {t.label} · {clock((t.endsAt - now) / 1000)} left
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
