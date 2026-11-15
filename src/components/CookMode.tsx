import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Popup, Page, Navbar, NavLeft, NavTitle, NavRight, Link, Toolbar, Button, Tabs, Tab, Block, List, ListItem,
  Sheet, PageContent, Actions, ActionsGroup, ActionsLabel, ActionsButton, f7,
} from 'framework7-react';
import { X, ListChecks, Timer as TimerIcon } from 'lucide-react';
import type { DemoIngredient, DemoRecipe } from '../demo/data';
import { scaleAmount, unitFor, friendly } from '../demo/quickParse';
import { stepTimers, stepIngredients, clock } from '../demo/cook';
import { navIcon, inlineIcon } from './ui/icons';
import { useStore } from '../demo/store';

type Props = { recipe: DemoRecipe; factor: number; onClose: () => void };
type RunningTimer = { id: number; label: string; step: number; endsAt: number };
type WakeLock = { release: () => Promise<void> };

const amountText = (i: DemoIngredient, factor: number) => {
  const a = scaleAmount(i.amount, factor);
  return [a, unitFor(i.unit, a)].filter(Boolean).join(' ');
};

/** Rows of an ingredient list with group labels; with `checks`, each row can be ticked off. */
function IngredientRows({ recipe, factor, only, checked, onToggle }: {
  recipe: DemoRecipe; factor: number; only?: DemoIngredient[]; checked?: Set<string>; onToggle?: (id: string) => void;
}) {
  const list = only ?? recipe.ingredients;
  const groups: { id: string; label?: string; items: DemoIngredient[] }[] = [];
  for (const i of list) {
    if (i.kind === 'header') groups.push({ id: i.id, label: i.name, items: [] });
    else {
      if (!groups.length) groups.push({ id: 'ungrouped', items: [] });
      groups[groups.length - 1].items.push(i);
    }
  }
  return (
    <>
      {groups.filter((g) => g.items.length).map((g) => (
        <div key={g.id} className="ck-ing-group">
          {g.label && <div className="ck-group-label">{g.label}</div>}
          <List dividers className="ck-plain-list ck-cook-list">
            {g.items.map((i) => (
              <ListItem key={i.id} checkbox={!!onToggle} checked={checked?.has(i.id)} onChange={onToggle ? () => onToggle(i.id) : undefined}>
                <span slot="title">
                  <span className="ck-amount">{amountText(i, factor)}</span> {i.name}
                </span>
                {i.note && <span slot="footer">{i.note}</span>}
              </ListItem>
            ))}
          </List>
        </div>
      ))}
    </>
  );
}

/**
 * Cook mode: full screen, one step at a time (swipe or Next), the screen kept awake.
 * - First page: every ingredient as a checklist to get things out; the checklist button in the top bar opens it from any step.
 * - Each step: its group, big text, the ingredients it mentions with today's amounts, and timers for the times it mentions.
 * - Timers keep running while you move between steps; the soonest shows in the top bar.
 * - Finish offers to mark the recipe as made.
 */
export default function CookMode({ recipe, factor, onClose }: Props) {
  const { saveRecipe } = useStore();
  const steps = useMemo(() => {
    let group: string | undefined;
    const out: { id: string; text: string; group?: string; groupStart: boolean }[] = [];
    for (const s of recipe.steps) {
      if (s.kind === 'header') group = s.text;
      else {
        out.push({ id: s.id, text: s.text, group, groupStart: !!group && out[out.length - 1]?.group !== group });
      }
    }
    return out;
  }, [recipe.steps]);
  const pages = steps.length + 1; // page 0 is the ingredients checklist
  const tabId = (n: number) => `ck-cook-${recipe.id}-${n}`;

  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [ingOpen, setIngOpen] = useState(false);
  const [timersOpen, setTimersOpen] = useState(false);
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [now, setNow] = useState(Date.now());
  const [awake, setAwake] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const nextTimerId = useRef(1);
  // the step pages are a Swiper (Framework7 swipeable tabs); its slide events tell us which step is showing
  type SwiperEl = HTMLElement & { swiper?: { activeIndex: number; slideTo: (i: number) => void } };
  const tabsRef = useRef<{ el: HTMLElement | null }>({ el: null });
  const tabsEl = () => tabsRef.current?.el as SwiperEl | null;
  useEffect(() => {
    const el = tabsEl();
    if (!el) return;
    const sync = () => el.swiper && setIndex(el.swiper.activeIndex);
    el.addEventListener('swiperslidechange', sync);
    return () => el.removeEventListener('swiperslidechange', sync);
  }, []);

  // keep the screen on while cooking (Screen Wake Lock; iPhone Safari 16.4+ and home screen apps on newer iOS)
  useEffect(() => {
    let lock: WakeLock | null = null;
    let done = false;
    const request = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } }).wakeLock;
        if (!wl || done) return;
        lock = await wl.request('screen');
        setAwake(true);
      } catch {
        setAwake(false);
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
  const cancelTimer = (id: number) => setTimers((cur) => cur.filter((x) => x.id !== id));

  const go = (n: number) => tabsEl()?.swiper?.slideTo(Math.max(0, Math.min(pages - 1, n)));
  const finish = () =>
    f7.dialog
      .create({
        title: 'Done cooking?',
        text: `Mark ${recipe.title} as made? You’ve made it ${recipe.timesMade}× so far.`,
        buttons: [
          { text: 'Not now', onClick: () => f7.popup.close('.ck-cook') },
          {
            text: 'Mark as made',
            strong: true,
            onClick: () => {
              saveRecipe({ ...recipe, timesMade: recipe.timesMade + 1 });
              f7.toast.show({ text: `Marked as made · ${recipe.timesMade + 1}×`, closeTimeout: 1800 });
              f7.popup.close('.ck-cook');
            },
          },
        ],
      })
      .open();

  const toggle = (id: string) =>
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const soonest = [...timers].sort((a, b) => a.endsAt - b.endsAt)[0];
  const scaled = Math.abs(factor - 1) > 0.001;

  return (
    <>
      <Popup className="ck-cook" opened onPopupClosed={onClose}>
        <Page pageContent={false}>
          <Navbar>
            <NavLeft>
              <Link iconOnly popupClose aria-label="Close cook mode">
                <X {...navIcon} />
              </Link>
            </NavLeft>
            <NavTitle>{index === 0 ? 'Get ready' : `Step ${index} of ${steps.length}`}</NavTitle>
            <NavRight>
              {soonest && (
                <Link className="ck-timer-pill" onClick={() => setTimersOpen(true)} aria-label={`Timers, next in ${clock((soonest.endsAt - now) / 1000)}`}>
                  <TimerIcon {...inlineIcon} />
                  <span>{clock((soonest.endsAt - now) / 1000)}</span>
                </Link>
              )}
              <Link iconOnly onClick={() => setIngOpen(true)} aria-label="Ingredients checklist">
                <ListChecks {...navIcon} />
              </Link>
            </NavRight>
          </Navbar>

          <Toolbar bottom className="ck-cta ck-cook-bar">
            {index > 0 && (
              <Button large className="ck-soft ck-cook-back" onClick={() => go(index - 1)}>
                Back
              </Button>
            )}
            <Button large fill className="ck-cta-button" onClick={() => (index === pages - 1 ? finish() : go(index + 1))}>
              {index === 0 ? 'Start' : index === pages - 1 ? 'Finish' : 'Next step'}
            </Button>
          </Toolbar>

          <Tabs swipeable ref={tabsRef}>
            <Tab id={tabId(0)} className="page-content" tabActive>
              <Block className="ck-cook-head">
                <h1 className="ck-cook-title">{recipe.title}</h1>
                <span className="ck-note">
                  {[scaled ? `×${friendly(factor)} · ${friendly(recipe.servings * factor)} servings` : `${recipe.servings} servings`, awake ? 'Screen stays on' : '']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="ck-note">Tick things off as you get them out. Swipe or tap Start for step 1.</span>
              </Block>
              <IngredientRows recipe={recipe} factor={factor} checked={checked} onToggle={toggle} />
            </Tab>

            {steps.map((s, k) => {
              const n = k + 1;
              const ings = stepIngredients(s.text, recipe.ingredients);
              return (
                <Tab key={s.id} id={tabId(n)} className="page-content">
                  <Block className="ck-cook-step">
                    {s.group && <div className="ck-group-label">{s.group}</div>}
                    <p className="ck-cook-text">{s.text}</p>
                    {stepTimers(s.text).map((t) => {
                      const running = timers.find((x) => x.step === n && x.label === t.label);
                      return running ? (
                        <Button key={t.label} large className="ck-soft ck-timer-button ck-timer-running" onClick={() => cancelTimer(running.id)}>
                          <TimerIcon {...inlineIcon} />
                          {clock((running.endsAt - now) / 1000)} left · Stop
                        </Button>
                      ) : (
                        <Button key={t.label} large className="ck-soft ck-timer-button" onClick={() => startTimer(n, t.label, t.seconds)}>
                          <TimerIcon {...inlineIcon} />
                          Start {t.label} timer
                        </Button>
                      );
                    })}
                  </Block>
                  {ings.length > 0 && (
                    <>
                      <Block className="ck-cook-sub">For this step</Block>
                      <IngredientRows recipe={recipe} factor={factor} only={ings} />
                    </>
                  )}
                </Tab>
              );
            })}
          </Tabs>
        </Page>
      </Popup>

      <Sheet
        opened={ingOpen}
        onSheetClosed={() => setIngOpen(false)}
        swipeToClose
        backdrop
        closeByBackdropClick
        style={{ height: 'auto', maxHeight: '80vh' }}
        className="ck-edit-sheet ck-cook-sheet"
      >
        <Toolbar>
          <div className="left">
            <b>Ingredients</b>
          </div>
          <div className="right">
            <Link sheetClose>Done</Link>
          </div>
        </Toolbar>
        <PageContent>
          <IngredientRows recipe={recipe} factor={factor} checked={checked} onToggle={toggle} />
        </PageContent>
      </Sheet>

      <Actions opened={timersOpen} onActionsClosed={() => setTimersOpen(false)}>
        <ActionsGroup>
          <ActionsLabel>Timers</ActionsLabel>
          {timers.map((t) => (
            <ActionsButton key={t.id} onClick={() => go(t.step)}>
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
