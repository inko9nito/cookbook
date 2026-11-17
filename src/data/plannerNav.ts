// The Planner's picked day (issue #62), kept outside its page: Framework7 makes the page anew when its tab goes back to
// its first page (App.tsx's backToFirstPage, or a recipe page's Planned chip), and the page should still show the day
// that was picked. A recipe page's Planned chip asks for a day here; a Planner page already showing hears it at once.

import type { Day } from '../lib/planner';

let picked: Day | null = null;
const listeners = new Set<(day: Day) => void>();

/** The day picked last in the Planner, or asked for by a Planned chip (null until then: today). */
export const plannerDay = () => picked;

export function rememberPlannerDay(day: Day) {
  picked = day;
}

/** Open the Planner on a day: remembered for a page made from now on, and told to a page already showing. */
export function showInPlanner(day: Day) {
  picked = day;
  listeners.forEach((l) => l(day));
}

export function onShowInPlanner(listener: (day: Day) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
