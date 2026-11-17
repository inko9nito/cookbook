import { f7 } from 'framework7-react';
import { dateOf, dayOf, type Day } from '../../lib/planner';

type Options = {
  /** the sheet's title, as a question ("Plan for which day?") */
  title: string;
  /** the day it opens on, filled as picked */
  value?: Day;
  /** days that already have something planned: a dot under each */
  busy?: Iterable<Day>;
  /** called once the sheet has closed, so what comes next (an action sheet, a toast) doesn't open over it */
  onPick: (day: Day) => void;
};

// how long the tapped day shows filled before the sheet closes (issue #67: closing at once, it wasn't clear the tap
// had done anything)
const SHOW_PICK_MS = 280;

/**
 * Pick a day (issues #62, #67): Framework7's Calendar in a bottom sheet, a month at a time (swipe or the arrows for the
 * next), weeks from Monday like the Planner's strip. The title asks the question; a tapped day fills in, then the sheet
 * closes and the pick goes through. Swiping the sheet down picks nothing.
 */
export function pickDay({ title, value, busy = [], onPick }: Options) {
  const events = [...busy].map((d) => ({ date: dateOf(d) }));
  let picked: Day | null = null;
  const calendar = f7.calendar.create({
    openIn: 'sheet',
    cssClass: 'ck-calendar',
    header: true,
    headerPlaceholder: title,
    // the header always reads as the question, not the picked date
    formatValue: () => title,
    value: value ? [dateOf(value)] : [],
    events,
    firstDay: 1,
    locale: 'en-US',
    sheetSwipeToClose: true,
    backdrop: true,
    yearSelector: false,
    on: {
      dayClick: (c, _el, year, month, day) => {
        if (picked) return;
        picked = dayOf(new Date(year, month, day));
        setTimeout(() => c.close(), SHOW_PICK_MS);
      },
      closed: (c) => {
        c.destroy();
        if (picked) onPick(picked);
      },
    },
  });
  calendar.open();
}
