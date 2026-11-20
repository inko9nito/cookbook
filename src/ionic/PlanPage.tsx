import { useEffect, useRef, useState } from 'react';
import {
  IonButton, IonList, IonItem, IonLabel, IonItemSliding, IonItemOptions, IonItemOption, useIonRouter, useIonViewDidEnter,
} from '@ionic/react';
import { Swiper, SwiperSlide } from 'swiper/react';
import type { Swiper as SwiperClass } from 'swiper/types';
import { CalendarSearch, ChefHat, NotebookPen, Plus, ShoppingCart } from 'lucide-react';
import { usePlanner, useStore } from '../data/store';
import {
  addDays, busyDays, dayName, daysBetween, inMeal, MEALS, mealName, mediumDate, plan, planNote, shortDate, slotsOn, today, weekDays,
  weekName, weekRange, weekStart, weekdayLetter, type Day, type Meal, type Planned,
} from '../lib/planner';
import { coverPhoto, formatMinutes, newId } from '../lib/recipe';
import { photoStyle } from './photo';
import { say, tell } from './toast';
import { friendly } from '../lib/ingredients';
import { TabPage } from './scroll';
import { BarButton, CookingPill, openMenu } from './ui';
import { DaySheet, NoteModal, RecipePickerModal } from './modals';

const WEEKS = 26; // weeks either side of this one in the strip

/**
 * The Planner on Ionic: the week strip swipes between weeks (Swiper), each day a circle with a dot when something's
 * planned; the agenda lists the week. Swipe a row left for Move (Ionic's calendar) and Delete; + on a day adds a recipe
 * (a card to pick one) or a note (its own screen).
 */
export default function PlanPage() {
  const now = today();
  const { recipes } = useStore();
  const { planned, savePlanned, deletePlanned } = usePlanner();
  const router = useIonRouter();
  const [picked, setPicked] = useState<Day>(now);
  const content = useRef<HTMLIonContentElement>(null);
  const busy = busyDays(planned);
  const thisWeek = weekStart(now);
  const shownWeek = weekStart(picked);
  const weeks = Array.from({ length: WEEKS * 2 + 1 }, (_, i) => addDays(thisWeek, (i - WEEKS) * 7));
  const [adding, setAdding] = useState<{ day: Day; meal?: Meal } | null>(null);
  const [noteFor, setNoteFor] = useState<{ day: Day; meal?: Meal; item?: Planned } | null>(null);
  const [moving, setMoving] = useState<Planned | null>(null);
  const [goTo, setGoTo] = useState(false);

  // as v1: the agenda opens at the picked day (today), a day picked in the strip scrolls to it, and scrolling the
  // agenda picks the day at the top
  const ignoreScrollUntil = useRef(0);
  const pickedNow = useRef(picked);
  pickedNow.current = picked;
  const scrollToDay = async (day: Day, smooth = true): Promise<boolean> => {
    const c = content.current;
    const target = document.getElementById(`ck-day-${day}`);
    if (!c || !target) return false;
    const el = await c.getScrollElement();
    // not laid out yet: Ionic puts the content under the bar (fullscreen) a moment after the page is on screen
    if (el.scrollHeight <= el.clientHeight || el.getBoundingClientRect().top > 1) return false;
    const bar = c.closest('.ion-page')?.querySelector('ion-header')?.getBoundingClientRect().bottom ?? 0;
    const top = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - bar - 16;
    const to = Math.min(Math.max(0, top), el.scrollHeight - el.clientHeight);
    ignoreScrollUntil.current = Date.now() + (smooth ? 900 : 200);
    await c.scrollToPoint(0, to, smooth ? 400 : 0);
    return true;
  };
  const ready = recipes.length > 0 || planned.length > 0;
  // once the page is on screen (Ionic's lifecycle: measured before that, it was laid out at nothing) and the plans are in
  const entered = useRef(false);
  const opened = useRef(false);
  const openAtPicked = () => {
    if (opened.current || !entered.current || !ready) return;
    opened.current = true;
    let tries = 0;
    const go = async () => {
      if (!(await scrollToDay(pickedNow.current, false)) && ++tries < 40) setTimeout(go, 50);
    };
    void go();
  };
  useIonViewDidEnter(() => {
    entered.current = true;
    openAtPicked();
  });
  useEffect(openAtPicked);
  useEffect(() => {
    let el: HTMLElement | undefined;
    const follow = () => {
      if (!el || Date.now() < ignoreScrollUntil.current) return;
      const days = [...el.querySelectorAll<HTMLElement>('[data-day]')];
      if (!days.length) return;
      const bar = el.closest('.ion-page')?.querySelector('ion-header')?.getBoundingClientRect().bottom ?? 0;
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
      let at = days[0];
      for (const d of days) if (d.getBoundingClientRect().top <= bar + 40) at = d;
      if (atEnd && el.scrollTop > 0) at = days[days.length - 1];
      const day = at.dataset.day as Day;
      if (day !== pickedNow.current) setPicked(day);
    };
    void content.current?.getScrollElement().then((e) => {
      el = e;
      e.addEventListener('scroll', follow, { passive: true });
    });
    return () => el?.removeEventListener('scroll', follow);
  }, []);
  const swiper = useRef<SwiperClass | null>(null);
  const pick = (day: Day) => {
    setPicked(day);
    const at = weeks.indexOf(weekStart(day));
    if (at >= 0 && swiper.current && swiper.current.activeIndex !== at) swiper.current.slideTo(at);
    requestAnimationFrame(() => void scrollToDay(day));
  };
  // + on a day: the app's menus (#39), what to add, then for which meal, each from the + tapped
  const addTo = (el: Element, day: Day) =>
    openMenu(el, [
      [
        { label: 'Add recipe', icon: ChefHat, onClick: () => mealThen(el, (meal) => setAdding({ day, meal })) },
        { label: 'Add note', icon: NotebookPen, onClick: () => mealThen(el, (meal) => setNoteFor({ day, meal })) },
      ],
    ]);
  const mealThen = (el: Element, then: (meal?: Meal) => void) =>
    setTimeout(() => openMenu(el, [[...MEALS, null].map((m) => ({ label: m ? mealName(m) : 'Any time', onClick: () => then(m ?? undefined) }))]), 250);

  return (
    <TabPage tab="plan" title="Planner"
      buttons={
        <>
          {picked !== now && (
            <IonButton fill="clear" className="ck-ion-text-button ck-ion-plan-today" onClick={() => pick(now)}>
              Today
            </IonButton>
          )}
          {/* #64: the week's planned recipes onto the grocery list */}
          <BarButton label="Shop this week" icon={ShoppingCart} onClick={() => tell('Shop this week isn’t in v2 yet')} />
          <BarButton label="Go to a day" icon={CalendarSearch} onClick={() => setGoTo(true)} />
        </>
      }
      extra={
        <>
          <div className="ck-week-label">{[weekName(shownWeek, now), weekRange(shownWeek, now)].filter(Boolean).join(' · ')}</div>
          <Swiper
            initialSlide={weeks.indexOf(shownWeek)}
            onSwiper={(sw) => (swiper.current = sw)}
            onSlideChange={(sw) => {
              const start = weeks[sw.activeIndex];
              if (start && start !== shownWeek) setPicked(start === thisWeek ? now : start);
            }}
            className="ck-ion-week-swiper"
          >
            {weeks.map((start) => (
              <SwiperSlide key={start}>
                <div className="ck-week">
                  {weekDays(start).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`ck-week-day ck-ion-plain-button${d === picked ? ' ck-week-selected' : ''}${d === now ? ' ck-week-today' : ''}${busy.has(d) ? ' ck-week-busy' : ''}`}
                      onClick={() => pick(d)}
                      aria-label={mediumDate(d)}
                    >
                      <span className="ck-week-letter" aria-hidden="true">{weekdayLetter(d)}</span>
                      <span className="ck-week-num" aria-hidden="true">{Number(d.slice(8))}</span>
                      <span className="ck-week-dot" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </>
      }
      contentRef={content}
    >
        <div className="ck-agenda">
        {weekDays(shownWeek).map((d) => {
          const slots = slotsOn(planned, d);
          const near = Math.abs(daysBetween(now, d)) <= 1;
          return (
            <section
              key={d}
              id={`ck-day-${d}`}
              data-day={d}
              className={`ck-plan-day${d === picked ? ' ck-plan-day-on' : ''}${d === now ? ' ck-plan-day-today' : ''}${ready && !slots.length ? ' ck-plan-day-empty' : ''}`}
            >
              <div className="ck-plan-day-head">
                <h2>
                  {dayName(d, now)} <span className="ck-plan-day-date">{near ? mediumDate(d) : shortDate(d)}</span>
                </h2>
                <button type="button" className="ck-plan-add ck-ion-plain-button" aria-label={`Add to ${mediumDate(d)}`} onClick={(e) => addTo(e.currentTarget, d)}>
                  <Plus size={18} strokeWidth={2} />
                </button>
              </div>
              {slots.length === 0 && <p className="ck-note ck-plan-empty">Nothing planned</p>}
              {slots.map((slot) => (
                <div key={slot.meal ?? 'day'} className="ck-plan-slot">
                  {slot.meal && <div className="ck-plan-slot-label">{mealName(slot.meal)}</div>}
                  <IonList inset lines="full" className="ck-ion-plan-list">
                    {slot.items.map((p) => {
                      const r = p.recipeId ? recipes.find((x) => x.id === p.recipeId) : undefined;
                      const photo = r && coverPhoto(r);
                      const meta = r ? [p.servings ? `${friendly(p.servings)} servings` : '', r.minutes > 0 ? formatMinutes(r.minutes) : ''].filter(Boolean).join(' · ') : '';
                      const takeOff = () => {
                        deletePlanned(p.id);
                        say(`Removed ${r ? `“${r.title}”` : 'the note'} from ${mediumDate(p.day)}`, { undo: () => savePlanned(p) });
                      };
                      return (
                        <IonItemSliding key={p.id}>
                          <IonItem
                            button
                            detail={!!r}
                            className={r ? '' : 'ck-ion-plan-note'}
                            onClick={() => (r ? router.push(`/plan/recipe/${r.id}`, 'forward') : setNoteFor({ day: p.day, meal: p.meal, item: p }))}
                          >
                            <span slot="start" className={`ck-picker-thumb${r ? ` ck-photo${photo ? '' : ' ck-photo-empty'}` : ' ck-plan-note-icon'}`} style={photoStyle(photo)}>
                              {r ? !photo && <ChefHat size={16} strokeWidth={1.5} /> : <NotebookPen size={18} strokeWidth={1.75} />}
                            </span>
                            <IonLabel className="ion-text-wrap">
                              <h3>{r ? r.title : p.note}</h3>
                              {meta && <p>{meta}</p>}
                            </IonLabel>
                          </IonItem>
                          <IonItemOptions side="end" onIonSwipe={takeOff}>
                            <IonItemOption
                              className="ck-ion-option-meal"
                              onClick={(e) => {
                                const el = e.currentTarget;
                                openMenu(el, [
                                  [...MEALS, null].map((m) => ({
                                    label: m ? mealName(m) : 'Any time',
                                    checked: (p.meal ?? null) === m,
                                    onClick: () => {
                                      if ((p.meal ?? null) === m) return;
                                      savePlanned(inMeal(p, m));
                                      say(m ? `Moved to ${mealName(m)}` : 'Moved to any time');
                                    },
                                  })),
                                ]);
                              }}
                            >
                              Meal
                            </IonItemOption>
                            <IonItemOption className="ck-ion-option-move" onClick={() => setMoving(p)}>
                              Move
                            </IonItemOption>
                            <IonItemOption color="danger" expandable onClick={takeOff}>
                              Remove
                            </IonItemOption>
                          </IonItemOptions>
                        </IonItemSliding>
                      );
                    })}
                  </IonList>
                </div>
              ))}
            </section>
          );
        })}
        </div>
        <CookingPill />
      
      <RecipePickerModal
        open={!!adding}
        single
        title="Add a Recipe"
        chosen={[]}
        onClose={() => setAdding(null)}
        onDone={([id]) => {
          if (adding && id) {
            savePlanned(plan(id, adding.day, newId, { meal: adding.meal }));
            say(`Added to ${dayName(adding.day, now)}`);
          }
          setAdding(null);
        }}
      />
      <NoteModal
        open={!!noteFor}
        title={noteFor?.item ? 'Note' : 'New Note'}
        value={noteFor?.item?.note ?? ''}
        onClose={() => setNoteFor(null)}
        onSave={(text) => {
          if (!noteFor) return;
          savePlanned(noteFor.item ? { ...noteFor.item, note: text } : planNote(text, noteFor.day, newId, noteFor.meal));
        }}
      />
      <DaySheet
        open={!!moving}
        title="Move to which day?"
        value={moving?.day}
        busy={busy}
        onClose={() => setMoving(null)}
        onPick={(day) => {
          if (moving) {
            savePlanned({ ...moving, day });
            say(`Moved to ${mediumDate(day)}`);
          }
          setMoving(null);
        }}
      />
      <DaySheet
        open={goTo}
        title="Go to which day?"
        value={picked}
        busy={busy}
        onClose={() => setGoTo(false)}
        onPick={(day) => {
          setGoTo(false);
          pick(day);
        }}
      />
    
    </TabPage>
  );
}
