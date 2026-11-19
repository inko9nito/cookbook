import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Toolbar } from 'framework7-react';
import { Check, ChefHat } from 'lucide-react';
import { coverPhoto, type Recipe } from '../lib/recipe';
import { photoStyle } from './ui/photo';

/** how long a finger rests on a tab before it lifts to be dragged (shorter and it fights scrolling the strip) */
const HOLD_MS = 350;
/** a finger that moves this far before the hold is up is scrolling the strip, not dragging */
const SLOP = 8;
/** near either end of the strip a dragged tab scrolls it */
const EDGE = 36;

export const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Props = {
  tabs: Recipe[];
  shownId: string;
  /** the tab whose recipe was just marked as made (its photo turns into a ✓ while it goes) */
  doneId: string | null;
  onShow: (recipeId: string) => void;
  onMove: (recipeId: string, toIndex: number) => void;
};

type Drag = {
  id: string;
  el: HTMLElement;
  startX: number;
  startY: number;
  /** where the finger is, in the strip's scrolled content */
  x: number;
  /** the finger's distance from the tab's left edge when it lifted */
  grab: number;
  lifted: boolean;
  hold: number;
};

/**
 * Cook mode's recipe tabs along the bottom (issues #65, #116): a Framework7 tab bar, each tab the recipe's photo and name.
 * Tap one to show it. Issue #116: hold one for a moment and it lifts; drag it sideways and the others make room; let go
 * and it settles there. The one gesture here that Framework7 doesn't have (its Sortable only does vertical lists), built
 * by hand at the user's request (see CLAUDE.md): a lifted tab follows the finger (a translateX) and the others slide to
 * their new places (Web Animations, none with Reduce Motion).
 */
export default function CookTabs({ tabs, shownId, doneId, onShow, onMove }: Props) {
  // the bar itself (Framework7's Toolbar, straight in the Page so Framework7 places it)
  const bar = () => document.querySelector<HTMLElement>('.popup.ck-cook .toolbar.ck-cook-recipes');
  const drag = useRef<Drag | null>(null);
  const [liftedId, setLiftedId] = useState<string | null>(null);
  // where each tab was before a move, so the ones that make room slide there instead of jumping
  const before = useRef<Map<string, number> | null>(null);
  // the tap that ends a drag doesn't also show that recipe
  const dropped = useRef(false);

  const inner = () => bar()?.querySelector<HTMLElement>('.toolbar-inner') ?? null;
  const tabEls = () => [...(inner()?.querySelectorAll<HTMLElement>('.ck-cook-recipe') ?? [])];
  const toContent = (clientX: number) => {
    const box = inner();
    return box ? clientX - box.getBoundingClientRect().left + box.scrollLeft : clientX;
  };
  /** the lifted tab under the finger */
  const follow = () => {
    const d = drag.current;
    if (!d?.lifted) return;
    d.el.style.transform = `translateX(${d.x - d.grab - d.el.offsetLeft}px) scale(1.05)`;
  };

  // the shown recipe's tab scrolls into view in the strip (a new recipe's tab is added at the end). Only the strip
  // scrolls, sideways: scrollIntoView also scrolled the boxes around it, and while cook mode was sliding up from below the
  // screen (Start cooking, Add to cooking, Resume) that pulled the whole of it up, top bar cut off and blank underneath
  useEffect(() => {
    const box = inner();
    const tab = box?.querySelector<HTMLElement>('.ck-cook-recipe-on');
    if (!box || !tab || drag.current) return;
    const left = tab.offsetLeft;
    const target = left < box.scrollLeft ? left - 14 : left + tab.offsetWidth > box.scrollLeft + box.clientWidth ? left + tab.offsetWidth - box.clientWidth + 14 : null;
    if (target !== null) box.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [shownId, tabs.length]);

  // after a move: the tabs that made room slide from where they were, and the lifted one stays under the finger
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
    // a finger holds to lift (a quick swipe scrolls the strip); a mouse lifts as soon as it moves
    if (!mouse) d.hold = window.setTimeout(lift, HOLD_MS);
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
    const box = inner();
    if (box) {
      const r = box.getBoundingClientRect();
      if (clientX < r.left + EDGE) box.scrollLeft -= 8;
      else if (clientX > r.right - EDGE) box.scrollLeft += 8;
    }
    d.x = toContent(clientX);
    follow();
    // past the middle of the tab beside it: they swap places
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

  const cancel = () => {
    const d = drag.current;
    if (d) clearTimeout(d.hold);
    drag.current = null;
  };

  const end = () => {
    const d = drag.current;
    if (!d) return;
    clearTimeout(d.hold);
    drag.current = null;
    if (!d.lifted) return;
    dropped.current = true;
    setTimeout(() => (dropped.current = false), 400);
    // it settles into its place
    const from = d.el.style.transform;
    d.el.style.transform = '';
    setLiftedId(null);
    if (from && !reducedMotion()) d.el.animate([{ transform: from }, { transform: 'none' }], { duration: 160, easing: 'ease-out' });
  };

  // touch: the strip's own touchmove, not passive, so a lifted tab can stop the strip scrolling under the finger
  useEffect(() => {
    const el = bar();
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || !drag.current) return;
      if (drag.current.lifted && e.cancelable) e.preventDefault();
      move(t.clientX, t.clientY, false);
    };
    const onEnd = () => end();
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  });

  return (
    <Toolbar tabbar bottom scrollable className={`ck-cook-recipes${liftedId ? ' ck-cook-recipes-dragging' : ''}`}>
        {tabs.map((t) => {
          const photo = coverPhoto(t);
          const done = t.id === doneId;
          return (
            <button
              key={t.id}
              type="button"
              data-id={t.id}
              className={[
                'ck-cook-recipe',
                t.id === shownId ? 'ck-cook-recipe-on' : '',
                t.id === liftedId ? 'ck-cook-recipe-lifted' : '',
              ].join(' ')}
              onClick={() => !dropped.current && onShow(t.id)}
              onTouchStart={(e) => start(t.id, e.currentTarget, e.touches[0].clientX, e.touches[0].clientY, false)}
              onMouseDown={(e) => e.button === 0 && start(t.id, e.currentTarget, e.clientX, e.clientY, true)}
              onMouseMove={(e) => drag.current && move(e.clientX, e.clientY, true)}
              onMouseUp={end}
              onMouseLeave={() => drag.current?.lifted || cancel()}
              // iOS's long-press menu would open where the hold lifts the tab
              onContextMenu={(e) => e.preventDefault()}
              aria-pressed={t.id === shownId}
            >
              {/* a little cover photo, so a recipe is found by sight (a recipe without one shows the chef hat); a recipe
                  just marked as made shows ✓ as its tab goes */}
              {done ? (
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
    </Toolbar>
  );
}
