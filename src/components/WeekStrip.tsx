import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'framework7-react';
import { addDays, daysBetween, mediumDate, weekDays, weekStart, weekdayLetter, type Day } from '../lib/planner';

type Props = {
  now: Day;
  selected: Day;
  /** days with something planned: a dot under the date */
  busy: Set<Day>;
  /** counts for each day's spoken label ("2 recipes") */
  countOf: (day: Day) => number;
  onSelect: (day: Day) => void;
};

// weeks you can swipe to either side of the one shown when the strip was made; picking a day further away (from the
// month calendar) makes a new strip around it
const BEFORE = 26;
const AFTER = 52;

type Swiper = { activeIndex: number; slideTo: (i: number, speed?: number) => void };
type SwiperEl = HTMLElement & { swiper?: Swiper };

/**
 * The Planner's calendar strip (issue #62): one week at a time, Monday to Sunday, each day its letter and date. Today's
 * date is Tomato; the picked day is filled (Tomato when it's today, dark otherwise), as in iOS's own Calendar; a dot
 * marks days with something planned. Swipe sideways for the week before or after (Framework7's Swiper): the same
 * weekday there is picked.
 */
export default function WeekStrip({ now, selected, busy, countOf, onSelect }: Props) {
  const ref = useRef<SwiperEl>(null);
  const shown = weekStart(selected);
  // the weeks in the strip, made around the week shown; remade only when a pick lands outside them
  const anchor = useRef(shown);
  const offset = daysBetween(anchor.current, shown) / 7;
  if (offset < -BEFORE || offset > AFTER) anchor.current = shown;
  const first = addDays(anchor.current, -7 * BEFORE);
  const weeks = useMemo(() => Array.from({ length: BEFORE + AFTER + 1 }, (_, i) => addDays(first, 7 * i)), [first]);
  const index = daysBetween(first, shown) / 7;

  // a swipe to another week picks the same weekday there
  const latest = useRef({ selected, onSelect, weeks });
  latest.current = { selected, onSelect, weeks };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const changed = () => {
      const { selected: sel, onSelect: pick, weeks: ws } = latest.current;
      const i = el.swiper?.activeIndex ?? 0;
      const moved = daysBetween(weekStart(sel), ws[i]);
      if (moved) pick(addDays(sel, moved));
    };
    el.addEventListener('swiperslidechange', changed);
    return () => el.removeEventListener('swiperslidechange', changed);
  }, [first]);

  // a pick from outside the strip (Today, the month calendar) shows its week
  useEffect(() => {
    const s = ref.current?.swiper;
    if (s && s.activeIndex !== index) s.slideTo(index, 0);
  }, [index, first]);

  return (
    <swiper-container key={first} ref={ref} class="ck-week-swiper" initial-slide={String(index)} resistance-ratio="0.5">
      {weeks.map((start) => (
        <swiper-slide key={start}>
          <div className="ck-week" role="group" aria-label={`Week of ${mediumDate(start)}`}>
            {weekDays(start).map((day) => {
              const n = countOf(day);
              const cls = ['ck-week-day', day === now && 'ck-week-today', day === selected && 'ck-week-selected', busy.has(day) && 'ck-week-busy'];
              return (
                // a Framework7 Link, not a <button>: Swiper won't start a swipe on a focused form control, and every spot
                // on the strip is a day
                <Link
                  key={day}
                  noLinkClass
                  className={cls.filter(Boolean).join(' ')}
                  aria-current={day === selected ? 'date' : undefined}
                  aria-label={`${day === now ? 'Today, ' : ''}${mediumDate(day)}${n ? `, ${n} ${n === 1 ? 'recipe' : 'recipes'}` : ''}`}
                  onClick={() => onSelect(day)}
                >
                  <span className="ck-week-letter" aria-hidden="true">{weekdayLetter(day)}</span>
                  <span className="ck-week-num" aria-hidden="true">{Number(day.slice(8))}</span>
                  <span className="ck-week-dot" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </swiper-slide>
      ))}
    </swiper-container>
  );
}
