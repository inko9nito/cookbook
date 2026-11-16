import { f7 } from 'framework7-react';

/**
 * A short Framework7 toast saying what just happened, for a change that doesn't show where you are: a recipe added to a
 * cookbook from the recipe's page, something deleted (the page closes), a new recipe saved. Changes you can see at once
 * (a rename, a colour, a cover, Organize) don't need one. Errors have their own, longer toasts (store.tsx).
 */
export function say(text: string) {
  f7.toast?.show({ text, closeTimeout: 2000 });
}
