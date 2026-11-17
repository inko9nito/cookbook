// Cook mode's state, for the whole app (issue #85). Cook mode used to live inside the recipe page, so leaving it to look
// at another recipe ended it. Now it lives here: the chevron tucks it away (everything kept, the timers still running and
// ringing), the Cooking button at the bottom of every screen (CookingFab) brings it back, and only Done cooking (or
// closing its last recipe) ends it. It's also kept on the phone as it changes (cookSession.ts), so it comes back after
// iOS reloads the app.
import { createContext, useContext, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { f7 } from 'framework7-react';
import { useAuth } from './auth';
import { useStore } from './store';
import { forgetCook, loadCook, saveCook, type PaneScroll, type SavedCook } from './cookSession';
import { withPick } from '../components/UnitChoices';
import type { UnitPicks } from '../components/ui/ingredientLine';
import type { Recipe } from '../lib/recipe';

/** what's ticked in one recipe */
export type Ticks = { ing: Set<string>; steps: Set<string> };
/** a recipe's scale and unit picks in cook mode */
export type Amounts = { factor: number; picks: UnitPicks };
export type RunningTimer = { id: number; recipeId: string; label: string; step: number; endsAt: number };

type Session = {
  /** the recipes open in cook mode, a tab each in the order they were opened, and the one shown */
  open: string[];
  shown: string;
  /** cook mode is on screen (false: tucked away behind the Cooking button) */
  expanded: boolean;
  /** kept per recipe even after its tab is closed, so opening it again picks up where it was */
  ticks: Record<string, Ticks>;
  amounts: Record<string, Amounts>;
  timers: RunningTimer[];
};

const ONE: Amounts = { factor: 1, picks: {} };
const noTicks = (): Ticks => ({ ing: new Set(), steps: new Set() });

const fromSaved = (s: SavedCook): Session => ({
  open: s.open,
  shown: s.shown,
  expanded: s.expanded,
  ticks: Object.fromEntries(Object.entries(s.ticks).map(([id, t]) => [id, { ing: new Set(t.ing), steps: new Set(t.steps) }])),
  amounts: s.amounts,
  timers: s.timers.map((t, i) => ({ ...t, id: i + 1 })),
});
const toSaved = (s: Session, scroll: Record<string, PaneScroll>): Omit<SavedCook, 'savedAt'> => ({
  open: s.open,
  shown: s.shown,
  expanded: s.expanded,
  ticks: Object.fromEntries(Object.entries(s.ticks).map(([id, t]) => [id, { ing: [...t.ing], steps: [...t.steps] }])),
  amounts: s.amounts,
  timers: s.timers.map(({ id: _id, ...t }) => t),
  scroll,
});

type Cook = {
  session: Session | null;
  /** Start cooking on a recipe page: a new cook session, or this recipe's tab in the one going (added if needed) */
  start: (recipeId: string, amounts: Amounts) => void;
  /** show a recipe's tab, opening it (a linked ingredient's recipe, issue #11) */
  show: (recipeId: string) => void;
  /** close one recipe's tab; the last one ends cooking */
  closeRecipe: (recipeId: string) => void;
  /** Done cooking: forget it all */
  end: () => void;
  minimize: () => void;
  expand: () => void;
  /** a recipe's amounts while it's open in cook mode (the recipe page shows the same), else undefined */
  amountsOf: (recipeId: string) => Amounts | undefined;
  setFactor: (recipeId: string, factor: number) => void;
  setPick: (recipeId: string, ingredientId: string, unit: string | null) => void;
  toggleTick: (recipeId: string, kind: keyof Ticks, id: string) => void;
  clearTicks: (recipeId: string) => void;
  startTimer: (recipeId: string, step: number, label: string, seconds: number) => void;
  stopTimer: (id: number) => void;
  stopAllTimers: () => void;
  timerName: (t: RunningTimer) => string;
  /** where each recipe's halves are scrolled to (kept without redrawing), and where they were before a reload */
  scroll: MutableRefObject<Record<string, PaneScroll>>;
  restoredScroll: Record<string, PaneScroll>;
};

const CookContext = createContext<Cook | null>(null);

export function useCook() {
  const cook = useContext(CookContext);
  if (!cook) throw new Error('useCook needs CookProvider');
  return cook;
}

/** The time now, ticking each second while `on` (a timer counting down on screen). */
export function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

type WakeLock = { release: () => Promise<void> };

export function CookProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { recipes, loading, loadError } = useStore();
  const [saved] = useState(loadCook);
  const [session, setSession] = useState<Session | null>(() => (saved ? fromSaved(saved) : null));
  const scroll = useRef<Record<string, PaneScroll>>(saved?.scroll ?? {});
  const nextTimerId = useRef((session?.timers.length ?? 0) + 1);
  const audio = useRef<AudioContext | null>(null);
  const title = (id: string) => recipes.find((r: Recipe) => r.id === id)?.title ?? 'Recipe';

  const update = (fn: (s: Session) => Session) => setSession((s) => (s ? fn(s) : s));

  // ── kept on the phone as it changes, and with the scroll positions as the app goes to the background ──
  const latest = useRef(session);
  latest.current = session;
  useEffect(() => {
    if (session) saveCook(toSaved(session, scroll.current));
    else forgetCook();
  }, [session]);
  useEffect(() => {
    const keep = () => latest.current && saveCook(toSaved(latest.current, scroll.current));
    const onHidden = () => document.visibilityState === 'hidden' && keep();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', keep);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', keep);
    };
  }, []);

  // brought back for recipes that were all deleted meanwhile (on another device): nothing left to cook
  useEffect(() => {
    if (!session || status !== 'signedIn' || loading || loadError) return;
    if (!session.open.some((id) => recipes.some((r) => r.id === id))) setSession(null);
  }, [session, status, loading, loadError, recipes]);

  // keep the screen on while cooking, tucked away or not (Screen Wake Lock)
  const cooking = !!session;
  useEffect(() => {
    if (!cooking) return;
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
  }, [cooking]);

  // ── timers: they ring wherever you are in the app ──
  // the sound is set up on a tap, so iPhone Safari allows it later
  const allowSound = () => {
    if (!audio.current) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current = Ctx ? new Ctx() : null;
    }
    audio.current?.resume().catch(() => {});
  };
  // timers brought back after a reload: the first tap anywhere sets up their sound
  useEffect(() => {
    if (!saved?.timers.length) return;
    document.addEventListener('click', allowSound, { capture: true, once: true });
    return () => document.removeEventListener('click', allowSound, { capture: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const several = (session?.open.length ?? 0) > 1;
  const timerName = (t: RunningTimer) => `${several ? `${title(t.recipeId)} · ` : ''}Step ${t.step}: ${t.label}`;

  // check once a second while a timer runs; ring and remove finished ones (one that ended while the app was away rings
  // as soon as it's back)
  const timers = session?.timers ?? [];
  useEffect(() => {
    if (!timers.length) return;
    const t = setInterval(() => {
      const n = Date.now();
      const finished = timers.filter((x) => x.endsAt <= n);
      if (!finished.length) return;
      update((s) => ({ ...s, timers: s.timers.filter((x) => x.endsAt > n) }));
      ring();
      f7.dialog.alert(finished.map((x) => `${timerName(x)} is up.`).join('\n'), 'Timer done');
    }, 1000);
    return () => clearInterval(t);
  }, [timers]); // eslint-disable-line react-hooks/exhaustive-deps

  const cook: Cook = {
    session,
    start: (recipeId, amounts) =>
      setSession((s) =>
        s
          ? {
              ...s,
              open: s.open.includes(recipeId) ? s.open : [...s.open, recipeId],
              shown: recipeId,
              expanded: true,
              amounts: s.amounts[recipeId] ? s.amounts : { ...s.amounts, [recipeId]: amounts },
            }
          : { open: [recipeId], shown: recipeId, expanded: true, ticks: {}, amounts: { [recipeId]: amounts }, timers: [] },
      ),
    show: (recipeId) =>
      update((s) => ({
        ...s,
        open: s.open.includes(recipeId) ? s.open : [...s.open, recipeId],
        shown: recipeId,
        amounts: s.amounts[recipeId] ? s.amounts : { ...s.amounts, [recipeId]: ONE },
      })),
    closeRecipe: (recipeId) =>
      setSession((s) => {
        if (!s) return s;
        const left = s.open.filter((x) => x !== recipeId);
        if (!left.length) return null;
        // the one before it is shown (or the next, for the first)
        const at = s.open.indexOf(recipeId);
        return { ...s, open: left, shown: s.shown === recipeId ? left[Math.max(0, at - 1)] : s.shown };
      }),
    end: () => setSession(null),
    minimize: () => update((s) => (s.expanded ? { ...s, expanded: false } : s)),
    expand: () => update((s) => (s.expanded ? s : { ...s, expanded: true })),
    amountsOf: (recipeId) => (session?.open.includes(recipeId) ? (session.amounts[recipeId] ?? ONE) : undefined),
    setFactor: (recipeId, factor) => update((s) => ({ ...s, amounts: { ...s.amounts, [recipeId]: { ...(s.amounts[recipeId] ?? ONE), factor } } })),
    setPick: (recipeId, ingredientId, unit) =>
      update((s) => {
        const cur = s.amounts[recipeId] ?? ONE;
        return { ...s, amounts: { ...s.amounts, [recipeId]: { ...cur, picks: withPick(cur.picks, ingredientId, unit) } } };
      }),
    toggleTick: (recipeId, kind, id) =>
      update((s) => {
        const cur = s.ticks[recipeId] ?? noTicks();
        const next = new Set(cur[kind]);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { ...s, ticks: { ...s.ticks, [recipeId]: { ...cur, [kind]: next } } };
      }),
    clearTicks: (recipeId) => update((s) => ({ ...s, ticks: { ...s.ticks, [recipeId]: noTicks() } })),
    startTimer: (recipeId, step, label, seconds) => {
      allowSound();
      const id = nextTimerId.current++;
      update((s) => ({ ...s, timers: [...s.timers, { id, recipeId, label, step, endsAt: Date.now() + seconds * 1000 }] }));
    },
    stopTimer: (id) => update((s) => ({ ...s, timers: s.timers.filter((x) => x.id !== id) })),
    stopAllTimers: () => update((s) => ({ ...s, timers: [] })),
    timerName,
    scroll,
    restoredScroll: saved?.scroll ?? {},
  };

  return <CookContext.Provider value={cook}>{children}</CookContext.Provider>;
}
