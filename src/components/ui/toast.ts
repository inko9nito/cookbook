import { f7 } from 'framework7-react';

// Lucide's "check", as markup: Framework7 builds the toast from an HTML string
const CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

type Options = {
  /** an Undo button at the end of the pill (Framework7's toast button); the toast stays a little longer to reach it */
  undo?: () => void;
};

/**
 * A short Framework7 toast, styled as a small dark pill (cookbook.css). `say` is for something done that doesn't show
 * where you are (a recipe added to a cookbook, the Planner or the grocery list, something deleted, a new recipe saved)
 * and has a Tomato check; changes you can see at once (a rename, a colour, a cover, Organize, a ticked row) don't need
 * one. `tell` is the same pill without the check, for a refusal or a problem. A new toast replaces the one showing
 * (Framework7 closes it).
 */
export function say(text: string, options: Options = {}) {
  show(`<span class="ck-toast">${CHECK}<span>${esc(text)}</span></span>`, options.undo ? 4000 : 2000, options.undo);
}

export function tell(text: string, closeTimeout = 3000) {
  show(`<span class="ck-toast"><span>${esc(text)}</span></span>`, closeTimeout);
}

function show(text: string, closeTimeout: number, undo?: () => void) {
  if (!f7.toast) return;
  f7.toast
    .create({
      text,
      closeTimeout,
      position: 'bottom',
      destroyOnClose: true,
      ...(undo ? { closeButton: true, closeButtonText: 'Undo', on: { closeButtonClick: undo } } : {}),
    })
    .open();
}
