import { useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonContent } from '@ionic/react';
import { TabBar, type TabName } from './ui';

/**
 * Issue #141, the Ionic trial: two ways for the pages to scroll, for the user to compare (Settings → Scrolling).
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
 * The old app's bar on scroll: `hidden` once scrolled past `from` and moving down, shown again as soon as the page moves
 * up (or is back near the top); `scrolled` once off the very top (#99: the docked bar's line and shadow).
 */
export function useHidingBar(enabled: boolean, from = 56) {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const last = useRef(0);
  const onScroll = (y: number) => {
    const d = y - last.current;
    last.current = y;
    setScrolled(y > 2);
    if (!enabled || y <= from) return setHidden(false);
    if (d > 4) setHidden(true);
    else if (d < -4) setHidden(false);
  };
  return { hidden: enabled && hidden, scrolled, onScroll };
}

/** A tab's first page, in the style picked: the title, its buttons, what sits under the title (search, chips…), the tab bar. */
export function TabPage({
  tab, title, buttons, extra, children, contentRef,
}: {
  tab: TabName;
  title: string;
  buttons?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  contentRef?: RefObject<HTMLIonContentElement | null>;
}) {
  const style = useScrollStyle();
  const bar = useHidingBar(style === 'old');
  return (
    <IonPage className={`ck-ion-anchor ck-ion-scroll-${style}`}>
      {style === 'old' ? (
        <IonHeader className={`ck-ion-header ck-ion-slide-header${bar.hidden ? ' ck-ion-bar-hidden' : ''}${bar.scrolled ? ' ck-ion-scrolled' : ''}`}>
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
      <IonContent ref={contentRef} fullscreen scrollEvents onIonScroll={(e) => bar.onScroll(e.detail.scrollTop)}>
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
