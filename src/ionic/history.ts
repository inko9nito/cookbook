/**
 * Issue #141, the move to Ionic: the browser's back and Ionic's page transitions.
 *
 * - Ionic animates every back. Safari's own back swipe has already slid the page away under the finger, so a back that
 *   didn't come from the app's back button (Ionic's IonBackButton) is shown at once, without Ionic's slide after it.
 * - Open cook mode is a history entry of its own (the same address, marked), so iOS's back gesture tucks it away
 *   instead of taking the page under it back. Taking that entry back (tucked away otherwise) is kept from the router.
 *
 * Installed before the app renders, so these listeners run before React Router's.
 */

type Marked = { ckCook?: boolean } | null;
const marked = () => !!(window.history.state as Marked)?.ckCook;

let fromApp = false;
let cookBack: (() => void) | null = null;
let swallow = 0;

export function installHistory() {
  document.addEventListener(
    'click',
    (e) => {
      if ((e.target as Element | null)?.closest?.('ion-back-button')) {
        fromApp = true;
        setTimeout(() => (fromApp = false), 1000);
      }
    },
    true,
  );
  window.addEventListener(
    'popstate',
    (e) => {
      if (swallow > 0) {
        swallow--;
        e.stopImmediatePropagation();
        return;
      }
      if (cookBack && !marked()) {
        e.stopImmediatePropagation();
        const back = cookBack;
        cookBack = null;
        back();
        return;
      }
      if (!fromApp) {
        const outlets = [...document.querySelectorAll<HTMLIonRouterOutletElement>('ion-router-outlet')];
        outlets.forEach((o) => (o.animated = false));
        setTimeout(() => outlets.forEach((o) => (o.animated = true)), 500);
      }
      fromApp = false;
    },
    true,
  );
}

/** cook mode is open: a history entry of its own; `back` runs when iOS's back takes it. Returns the undo. */
export function onCookBack(back: () => void) {
  if (!marked()) window.history.pushState({ ...((window.history.state as object | null) ?? {}), ckCook: true }, '');
  cookBack = back;
  return () => {
    if (cookBack === back) cookBack = null;
    if (marked()) {
      swallow++;
      window.history.back();
    }
  };
}
