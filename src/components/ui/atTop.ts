import { useEffect, useRef, useState } from 'react';

/**
 * Issue #99: whether a page is scrolled to its top. The Recipes search bar (and a cookbook section's) shows its line
 * and shadow only once the page has scrolled, as iOS's own bars do; at the top it sits flat on the page. Framework7 has
 * no class for "this page is scrolled", so this one listener sets it: pass `onPageInit` to the Page, and put
 * `ck-at-top` in its className while `atTop`. It only says where the page is; the look is CSS (colours only, no
 * animation). The Planner's week strip keeps its line and shadow all the time, so it doesn't use this.
 */
export function useAtTop() {
  const [atTop, setAtTop] = useState(true);
  const off = useRef<(() => void) | null>(null);
  useEffect(() => () => off.current?.(), []);
  const onPageInit = (page?: { el?: HTMLElement }) => {
    const content = page?.el?.querySelector<HTMLElement>(':scope > .page-content');
    if (!content) return;
    off.current?.();
    // iOS's bounce at the top scrolls below 0: still the top
    const check = () => setAtTop(content.scrollTop <= 0);
    check();
    content.addEventListener('scroll', check, { passive: true });
    off.current = () => content.removeEventListener('scroll', check);
  };
  return { atTop, onPageInit };
}
