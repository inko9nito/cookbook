import { f7 } from 'framework7-react';

/** The bit of Framework7's router this needs (a page's `f7router`). */
type LeavingRouter = {
  back: () => void;
  once?: (event: 'routeChanged', handler: () => void) => void;
};

/**
 * Delete what a page shows, then leave it (issue #141), one step at a time as iOS apps do: Framework7's confirm dialog
 * finishes closing, then the page goes back, and only once it's gone is the thing deleted (`onGone`: the save and the
 * toast). Done all at once (the dialog closing, Framework7 letting the page under it scroll again, the slide back, the
 * toast and the list changing, all in the same moment), iPhone Safari now and then stopped drawing the header of the
 * page that slid in, at the moment the slide ended. `onConfirmed` runs at OK, before anything moves.
 * Each wait has a time limit, so the delete happens even if an event never comes.
 */
export function confirmDelete(text: string, title: string, router: LeavingRouter | undefined, onGone: () => void, onConfirmed?: () => void) {
  const dialog = f7.dialog.confirm(text, title, () => {
    onConfirmed?.();
    let deleted = false;
    const gone = () => {
      if (deleted) return;
      deleted = true;
      onGone();
    };
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      if (!router) return gone();
      // after the slide's last frame, once the old page is out of the page (React takes it out a moment after the router)
      router.once?.('routeChanged', () => requestAnimationFrame(() => requestAnimationFrame(gone)));
      router.back();
      setTimeout(gone, 1500);
    };
    dialog.once('closed', leave);
    setTimeout(leave, 700);
  });
}
