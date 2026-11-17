import { f7 } from 'framework7-react';
import { dateOf, dayOf, type Day } from '../../lib/planner';

type Options = {
  /** the sheet's title ("Add to Planner") */
  title: string;
  /** the day it opens on, ringed as picked */
  value?: Day;
  /** days that already have something planned: a dot under each */
  busy?: Iterable<Day>;
  onPick: (day: Day) => void;
};

/**
 * Pick a day (issue #62): Framework7's Calendar in a bottom sheet, a month at a time (swipe for the next), weeks from
 * Monday like the Planner's strip. Tapping a day picks it and closes the sheet; swiping it down picks nothing.
 */
export function pickDay({ title, value, busy = [], onPick }: Options) {
  const events = [...busy].map((d) => ({ date: dateOf(d) }));
  const calendar = f7.calendar.create({
    openIn: 'sheet',
    cssClass: 'ck-calendar',
    header: true,
    headerPlaceholder: title,
    // the header always reads as the title, not the picked date
    formatValue: () => title,
    value: value ? [dateOf(value)] : [],
    events,
    firstDay: 1,
    locale: 'en-US',
    closeOnSelect: true,
    sheetSwipeToClose: true,
    backdrop: true,
    yearSelector: false,
    on: {
      dayClick: (_c, _el, year, month, day) => onPick(dayOf(new Date(year, month, day))),
      closed: (c) => c.destroy(),
    },
  });
  calendar.open();
}
