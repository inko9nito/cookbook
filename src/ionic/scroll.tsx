import { useMemo, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonContent } from '@ionic/react';
import { TabBar, type TabName } from './ui';

/**
 * Issue #141, the move to Ionic: two ways for the pages to scroll, for the user to compare (Settings → Scrolling).
 * - 'old': as the Framework7 app does. A tab's title row slides away as you scroll down and back as you scroll up
 *   (Framework7's hideNavbarOnScroll), its search and chips staying at the top; a cookbook's plates and colour fade
 *   under a see-through bar; a recipe's bar fades in over the photo, then slides away the same way. Ionic has none of
 *   this, so it's built here: one scroll handler per page that sets classes, and the slide is a CSS transition.
 * - 'ios': Ionic's own iOS large titles, no custom code: the big title scrolls up with the page and a small one fades
 *   into the bar, which stays; search and chips scroll away with the page.
 * Both put the page's content under the bar (it runs under it, as #141's Framework7 pages did).
 */

export type ScrollStyle = 'old' | 'ios';
const KEY = 'ck-ion-scroll';
const listeners = new Set<() => void>();
const read = (): ScrollStyle => {
  try {
    return localStorage.getItem(KEY) === 'ios' ? 'ios' : 'old';
  } catch {
    return 'old';
  }
};
let current: ScrollStyle = read();
export const useScrollStyle = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
export function setScrollStyle(s: ScrollStyle) {
  current = s;
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* private mode: for this visit only */
  }
  listeners.forEach((l) => l());
}

/**
 * The old app's bar on scroll, as Framework7's hideNavbarOnScroll decides it (framework7/components/navbar/navbar.js):
 * hidden once past the bar's own height and moving down; shown as soon as the page moves up, near the top, or at the
 * very end. Classes are set on the header straight away (no React render per scroll frame, which made the cookbook
 * jitter); the slide and the fade are CSS, 400ms with Framework7's ease.
 * Also `ck-ion-scrolled` once off the very top (#99), and, for a see-through bar, `--ck-fill` (0 → 1 over the bar's
 * height, as Framework7's transparent navbar, held while the bar is hidden) and `ck-ion-solid` at 1.
 */
export function barOnScroll(
  header: RefObject<HTMLIonHeaderElement | null>,
  opts: { hide?: () => boolean; fill?: boolean } = {},
) {
  let last = 0;
  return (e: CustomEvent<{ scrollTop: number }>) => {
    const el = header.current;
    if (!el) return;
    const y = e.detail.scrollTop;
    const bar = el.querySelector('ion-toolbar')?.offsetHeight ?? 56;
    const content = e.target as HTMLElement;
    const scroller = content.shadowRoot?.querySelector<HTMLElement>('.inner-scroll');
    const atEnd = !!scroller && y + scroller.clientHeight >= scroller.scrollHeight - 1;
    // Framework7's order: at the end or moving up shows it, past the bar's height moving down hides it, else shown
    const hide = (opts.hide?.() ?? true) && !atEnd && y >= last && y > bar;
    last = y;
    el.classList.toggle('ck-ion-bar-hidden', hide);
    el.classList.toggle('ck-ion-scrolled', y > 2);
    if (opts.fill && !hide) {
      const f = Math.min(1, Math.max(0, y / bar));
      el.style.setProperty('--ck-fill', String(f));
      el.classList.toggle('ck-ion-solid', f >= 1);
    }
  };
}

/** A tab's first page, in the style picked: the title, its buttons, what sits under the title (search, chips…), the tab bar. */
export function TabPage({
  tab, title, buttons, extra, children, contentRef, hides = false,
}: {
  tab: TabName;
  title: string;
  buttons?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  contentRef?: RefObject<HTMLIonContentElement | null>;
  /** the title row slides away on scrolling down (old style): as v1, only Recipes (and a cookbook, a recipe) do */
  hides?: boolean;
}) {
  const style = useScrollStyle();
  const header = useRef<HTMLIonHeaderElement>(null);
  const hidesRef = useRef(hides);
  hidesRef.current = hides;
  const onBar = useMemo(() => barOnScroll(header, { hide: () => hidesRef.current }), []);
  const onScroll = style === 'old' ? onBar : undefined;
  return (
    <IonPage className={`ck-ion-anchor ck-ion-scroll-${style}`}>
      {style === 'old' ? (
        <IonHeader ref={header} className="ck-ion-header ck-ion-slide-header">
          <IonToolbar>
            <IonTitle className="ck-ion-title">{title}</IonTitle>
            {buttons && <IonButtons slot="end">{buttons}</IonButtons>}
          </IonToolbar>
          {extra && <div className="ck-ion-header-extra">{extra}</div>}
        </IonHeader>
      ) : (
        <IonHeader className="ck-ion-header ck-ion-large-header">
          <IonToolbar>
            <IonTitle>{title}</IonTitle>
            {buttons && <IonButtons slot="end">{buttons}</IonButtons>}
          </IonToolbar>
        </IonHeader>
      )}
      <IonContent ref={contentRef} fullscreen scrollEvents={!!onScroll} onIonScroll={onScroll}>
        {style === 'ios' && (
          <>
            <IonHeader collapse="condense" className="ck-ion-large-title">
              <IonToolbar>
                <IonTitle size="large">{title}</IonTitle>
              </IonToolbar>
            </IonHeader>
            {extra && <div className="ck-ion-header-extra">{extra}</div>}
          </>
        )}
        {children}
      </IonContent>
      <TabBar current={tab} />
    </IonPage>
  );
}
