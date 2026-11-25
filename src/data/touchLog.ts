// TEMPORARY (issue #164): holding a Planner row lifted it only some of the time on the iPhone, and Chromium can't
// reproduce it. With `?touchlog` in the address (kept on this phone until `?touchlog=off`), each long hold on a Planner
// or editor row ends with a toast saying what the browser sent: how long, how far the finger moved, whether
// Framework7's hold fired and the row lifted, whether iOS cancelled the touch or the page scrolled. Remove once found.

import { tell } from '../components/ui/toast';

const KEY = 'ck-touchlog';

function enabled(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('touchlog');
    if (q === 'off') localStorage.removeItem(KEY);
    else if (q !== null) localStorage.setItem(KEY, '1');
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

type Hold = {
  t0: number;
  x: number;
  y: number;
  li: HTMLElement;
  target: string;
  moved: number;
  moves: number;
  scrolled: boolean;
  timer?: number;
  taphold?: number;
  lifted?: number;
  cancel?: number;
};

const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''}`;

export function startTouchLog() {
  if (!enabled()) return;
  let hold: Hold | null = null;
  const ms = () => Math.round(performance.now() - (hold?.t0 ?? 0));
  const onScroll = () => hold && (hold.scrolled = true);

  document.addEventListener(
    'touchstart',
    (e) => {
      const target = e.target as Element;
      const li = target.closest?.('.ck-plan-list li, .ck-edit-list li') as HTMLElement | null;
      if (!li || e.touches.length > 1) return (hold = null);
      const t = e.touches[0];
      hold = { t0: performance.now(), x: t.clientX, y: t.clientY, li, target: describe(target), moved: 0, moves: 0, scrolled: false };
      const mine = hold;
      setTimeout(() => {
        if (hold !== mine) return;
        mine.timer = ms();
        if (mine.li.classList.contains('sorting') && mine.lifted === undefined) mine.lifted = ms();
      }, 800);
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!hold) return;
      const t = e.touches[0];
      hold.moves += 1;
      hold.moved = Math.max(hold.moved, Math.round(Math.hypot(t.clientX - hold.x, t.clientY - hold.y)));
      if (hold.lifted === undefined && hold.li.classList.contains('sorting')) hold.lifted = ms();
    },
    { capture: true, passive: true },
  );
  document.addEventListener('taphold', () => hold && hold.taphold === undefined && (hold.taphold = ms()), true);
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  const end = (cancelled: boolean) => {
    if (!hold) return;
    const h = hold;
    hold = null;
    if (cancelled) h.cancel = Math.round(performance.now() - h.t0);
    if (h.lifted === undefined && h.li.classList.contains('sorting')) h.lifted = Math.round(performance.now() - h.t0);
    const total = Math.round(performance.now() - h.t0);
    if (total < 400) return;
    const at = (n?: number) => (n === undefined ? 'no' : `${n}ms`);
    tell(
      [
        `Held ${total}ms on ${h.target}`,
        `moved ${h.moved}px (${h.moves} moves)`,
        `timer ${at(h.timer)} · hold ${at(h.taphold)} · lifted ${at(h.lifted)}`,
        `cancelled ${at(h.cancel)} · scrolled ${h.scrolled ? 'yes' : 'no'}`,
      ].join(' — '),
      8000,
    );
  };
  document.addEventListener('touchend', () => end(false), { capture: true, passive: true });
  document.addEventListener('touchcancel', () => end(true), { capture: true, passive: true });
}
