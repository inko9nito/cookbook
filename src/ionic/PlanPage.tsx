import { useRef, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem, IonLabel, IonItemSliding,
  IonItemOptions, IonItemOption, IonNote, useIonRouter,
} from '@ionic/react';
import { Swiper, SwiperSlide } from 'swiper/react';
import type { Swiper as SwiperClass } from 'swiper/types';
import { CalendarSearch, ChefHat, NotebookPen, Plus } from 'lucide-react';
import { usePlanner, useStore } from '../data/store';
import {
  addDays, busyDays, dayName, MEALS, mealName, plan, planNote, shortDate, slotsOn, today, weekDays, weekName, weekRange, weekStart,
  weekdayLetter, type Day, type Meal, type Planned,
} from '../lib/planner';
import { coverPhoto, newId } from '../lib/recipe';
import { formatMinutes } from '../components/ui/RecipeCard';
import { photoStyle } from '../components/ui/photo';
import { say } from '../components/ui/toast';
import { BarButton, CookingPill, openMenu, TabBar } from './ui';
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

  const scrollToDay = (day: Day) => {
    const el = document.getElementById(`ck-day-${day}`);
    if (el) content.current?.scrollToPoint(0, el.offsetTop - 8, 400);
  };
  const swiper = useRef<SwiperClass | null>(null);
  const pick = (day: Day) => {
    setPicked(day);
    const at = weeks.indexOf(weekStart(day));
    if (at >= 0 && swiper.current && swiper.current.activeIndex !== at) swiper.current.slideTo(at);
    requestAnimationFrame(() => scrollToDay(day));
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
    <IonPage className="ck-ion-anchor">
      <IonHeader className="ck-ion-header">
        <IonToolbar>
          <IonTitle className="ck-ion-title">Planner</IonTitle>
          <IonButtons slot="end">
            <BarButton label="Go to a day" icon={CalendarSearch} onClick={() => setGoTo(true)} />
          </IonButtons>
        </IonToolbar>
        <div className="ck-ion-header-extra ck-ion-week-bar">
          <div className="ck-ion-week-name">
            {weekName(shownWeek, now) ?? 'Week of'} · {weekRange(shownWeek, now)}
          </div>
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
                <div className="ck-ion-week">
                  {weekDays(start).map((d) => (
                    <button key={d} type="button" className={`ck-ion-day${d === picked ? ' ck-ion-day-on' : ''}${d === now ? ' ck-ion-day-today' : ''}`} onClick={() => pick(d)}>
                      <span className="ck-ion-day-letter">{weekdayLetter(d)}</span>
                      <span className="ck-ion-day-circle">{Number(d.slice(8))}</span>
                      <span className={`ck-ion-day-dot${busy.has(d) ? ' on' : ''}`} />
                    </button>
                  ))}
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </IonHeader>
      <IonContent ref={content}>
        {weekDays(shownWeek).map((d) => {
          const slots = slotsOn(planned, d);
          return (
            <div key={d} id={`ck-day-${d}`} className={`ck-ion-agenda-day${d === picked ? ' ck-ion-agenda-on' : ''}`}>
              <div className="ck-ion-sec ck-ion-day-head">
                <h2>
                  {dayName(d, now)} <span className="ck-note">{shortDate(d)}</span>
                </h2>
                <IonButton fill="clear" className="ck-ion-icon-button" aria-label={`Add to ${dayName(d, now)}`} onClick={(e) => addTo(e.currentTarget, d)}>
                  <Plus size={22} />
                </IonButton>
              </div>
              {slots.length === 0 && <p className="ck-note ck-ion-day-empty">Nothing planned</p>}
              {slots.map((slot) => (
                <div key={slot.meal ?? 'day'}>
                  {slot.meal && <div className="ck-group-label ck-ion-meal">{mealName(slot.meal)}</div>}
                  <IonList inset lines="full" className="ck-ion-inset">
                    {slot.items.map((p) => {
                      const r = p.recipeId ? recipes.find((x) => x.id === p.recipeId) : undefined;
                      const photo = r && coverPhoto(r);
                      return (
                        <IonItemSliding key={p.id}>
                          <IonItem
                            button
                            detail
                            onClick={() => (r ? router.push(`/plan/recipe/${r.id}`, 'forward') : setNoteFor({ day: p.day, meal: p.meal, item: p }))}
                          >
                            <span slot="start" className={`ck-ion-thumb${photo ? ' ck-photo' : ' ck-photo-empty'}`} style={photoStyle(photo)}>
                              {!photo && (r ? <ChefHat size={16} strokeWidth={1.5} /> : <NotebookPen size={16} strokeWidth={1.5} />)}
                            </span>
                            <IonLabel className="ion-text-wrap">
                              <h3>{r ? r.title : p.note}</h3>
                              {r && <p>{[p.servings && `${p.servings} servings`, r.minutes > 0 && formatMinutes(r.minutes)].filter(Boolean).join(' · ')}</p>}
                            </IonLabel>
                          </IonItem>
                          <IonItemOptions side="end">
                            <IonItemOption className="ck-ion-option-move" onClick={() => setMoving(p)}>
                              Move
                            </IonItemOption>
                            <IonItemOption
                              color="danger"
                              expandable
                              onClick={() => {
                                deletePlanned(p.id);
                                say(r ? `Took “${r.title}” off ${dayName(p.day, now)}` : 'Note deleted', { undo: () => savePlanned(p) });
                              }}
                            >
                              Delete
                            </IonItemOption>
                          </IonItemOptions>
                        </IonItemSliding>
                      );
                    })}
                  </IonList>
                </div>
              ))}
            </div>
          );
        })}
        <IonNote className="ck-ion-footnote ck-ion-week-hint">Swipe the week strip for other weeks. Swipe a row left to move or delete it.</IonNote>
        <CookingPill />
      </IonContent>
      <TabBar current="plan" />

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
            say(`Moved to ${dayName(day, now)}`);
          }
          setMoving(null);
        }}
      />
      <DaySheet
        open={goTo}
        title="Go to a day"
        value={picked}
        busy={busy}
        onClose={() => setGoTo(false)}
        onPick={(day) => {
          setGoTo(false);
          pick(day);
        }}
      />
    </IonPage>
  );
}
